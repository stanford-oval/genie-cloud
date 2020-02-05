# Almond Voice

Currently, Almond Voice provides two REST endpoints that provides TTS and STT functionality for Almond-based services, both hosted at [voice.almond.stanford.edu](https://voice.almond.stanford.edu). Support for websocket-based streaming will be added in the future.

## Speech-to-text

### Request

```
POST /rest/stt
Host: voice.almond.stanford.edu
Content-Type: multipart/form-data
```

Where the body of the request contains a `.wav` file. The file does not need to have a specific sample rate, as the server automatically resamples submitted audio.

### Response

```json
{
    "success": true,
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
    "success": true,
    "audio": "/audio/<arbitrary_speech_filename>.wav"
}
```

The audio file linked in the response is not guaranteed to remain online for longer than an hour.