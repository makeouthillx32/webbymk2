using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Wave;

static string? Arg(IReadOnlyList<string> args, string name)
{
    for (var index = 0; index < args.Count - 1; index++)
    {
        if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase)) return args[index + 1];
    }
    return null;
}

using var devices = new MMDeviceEnumerator();
var endpoints = devices.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active).ToArray();

if (args.Contains("--list", StringComparer.OrdinalIgnoreCase))
{
    Console.WriteLine(JsonSerializer.Serialize(endpoints.Select(device => new
    {
        id = device.ID,
        name = device.FriendlyName,
        state = device.State.ToString(),
    }), new JsonSerializerOptions { WriteIndented = true }));
    return 0;
}

var deviceId = Arg(args, "--device-id");
var file = Arg(args, "--file");
if (string.IsNullOrWhiteSpace(deviceId) || string.IsNullOrWhiteSpace(file))
{
    Console.Error.WriteLine("Usage: TankAudioPlayer --list | --device-id <endpoint-id> --file <audio-file>");
    return 2;
}

var target = endpoints.FirstOrDefault(device => string.Equals(device.ID, deviceId, StringComparison.OrdinalIgnoreCase));
if (target is null)
{
    Console.Error.WriteLine("The requested audio endpoint is not active.");
    return 3;
}

if (!File.Exists(file))
{
    Console.Error.WriteLine("The requested audio file does not exist.");
    return 4;
}

try
{
    using var reader = new AudioFileReader(file);
    using var output = new WasapiPlayerBuilder()
        .WithDevice(target)
        .WithSharedMode()
        .WithEventSync()
        .WithLatency(100)
        .WithLowLatency(false)
        .WithMmcssThreadPriority("Audio")
        .Build();
    using var finished = new ManualResetEventSlim(false);
    Exception? playbackError = null;

    output.PlaybackStopped += (_, eventArgs) =>
    {
        playbackError = eventArgs.Exception;
        finished.Set();
    };
    output.Init(reader);
    output.Play();
    finished.Wait(TimeSpan.FromMinutes(6));

    if (output.PlaybackState != PlaybackState.Stopped)
    {
        output.Stop();
        Console.Error.WriteLine("Audio playback timed out.");
        return 5;
    }

    if (playbackError is not null)
    {
        Console.Error.WriteLine($"Audio playback failed: {playbackError.Message}");
        return 6;
    }

    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine($"Audio playback failed: {error.Message}");
    return 7;
}
