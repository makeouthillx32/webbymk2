let capturedEarlyInput = '';
let captureListener: ((chunk: string | Buffer) => void) | null = null;
let captureStdin: NodeJS.ReadStream | null = null;

function appendEarlyInput(chunk: string | Buffer) {
  capturedEarlyInput += chunk.toString('utf8');
}

export function startCapturingEarlyInput(stdin: NodeJS.ReadStream = process.stdin): void {
  if (captureListener !== null) {
    return;
  }

  captureStdin = stdin;
  captureListener = (chunk: string | Buffer) => {
    appendEarlyInput(chunk);
  };

  stdin.on('data', captureListener);
}

export function stopCapturingEarlyInput(): void {
  if (!captureListener || !captureStdin) {
    return;
  }

  captureStdin.off('data', captureListener);
  captureListener = null;
  captureStdin = null;
}

export function consumeEarlyInput(): string {
  const input = capturedEarlyInput;
  capturedEarlyInput = '';
  return input;
}
