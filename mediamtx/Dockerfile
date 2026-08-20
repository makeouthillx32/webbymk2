# MediaMTX + curl.
#
# The stock image is Alpine with BusyBox, whose wget CANNOT send a binary
# request body: given --post-file on an MP4 it transmits only the leading text
# bytes (measured: a 100,000-byte file arrived as Content-Length 116) and
# Supabase Storage happily creates a 0-byte object and returns 200. That failure
# is completely silent — the upload "succeeds", the index row is written, and
# the footage does not exist. BusyBox nc fares no better.
#
# curl is the smallest honest fix: the recording hook needs exactly one thing
# the base image lacks, which is an HTTP client that can PUT/POST bytes and
# report a real status code.
FROM bluenviron/mediamtx:1.20.0-ffmpeg

RUN apk add --no-cache curl

# Entrypoint and command are inherited from the base image on purpose — this
# layer adds a binary and changes nothing about how MediaMTX starts.
