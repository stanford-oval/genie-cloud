# Almond Voice

Currently, Almond Voice provides two REST endpoints that provides TTS and STT functionality for Almond-based services, both hosted at [voice.almond.stanford.edu](https://voice.almond.stanford.edu). Support for websocket-based streaming will be added in the future.

**Note:** This API is experimental and may be significantly modified in the future. Please use with caution.

## Speech-to-text

### Request

```
POST /rest/stt
Host: voice.almond.stanford.edu
Content-Type: multipart/form-data
```

Where the body of the request contains a `.wav` file with the correct MIME type `audio/wav`. The wav file needs to have a bit depth of 16 and be little endian; however, it does not need to have a specific sample rate, as the server automatically resamples submitted audio.

### Response

```json
{
    "status": "ok",
    "text": "Recognized text."
}
```

## Text-to-speech

### Request

```
POST /rest/tts
Host: voice.almond.stanford.edu
```

Parameters:
```json
{
    "text": "Text to convert to speech."
}
```

### Response

```json
{
    "status": "ok",
    "audio": "/audio/<arbitrary_speech_filename>.wav"
}
```

The audio file linked in the response is not guaranteed to remain online for longer than an hour.