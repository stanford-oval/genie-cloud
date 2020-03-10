# Almond Natural Language Processing API

The NLP API of Almond provides low-level access to the speech and natural language capabilities of Almond. It is suitable to build custom experiences that need additional control beyond what is provided by the [dialog API](almond-dialog-api-reference.md).

At the moment, there is no authentication or rate limiting in the API. This might change in the future.

**Note:** This API is experimental and may be significantly modified in the future. Please use with caution.

[[toc]]

## Accessing the NLP API

The API is available at <https://nlp.almond.stanford.edu>. You must append the desired locale to the URL, for example: <https://nlp.almond.stanford.edu/en-US>. Currently, only `en-US` is officially supported; other locales are in development and will be added in the future.

NOTE: Almond and Genie client libraries will append the locale automatically, so you should pass the URL without it.

All APIs use `POST` request methods. Except where noted, APIs expect a JSON request body, with appropriate `Content-Type` header. 

### Custom NLP Models

If you create a custom LUInet model (from the [developer console](/developers/models)), you can access it using a custom API endpoint. That endpoint is formed by prepending `@` + the ID of the model to the path of each request.
For example, to access the model `com.example.foo` in American English, you would issue queries to <https://nlp.almond.stanford.edu/@com.example.foo/en-US>.

## Natural Language Understanding: /query

The most basic API: given a sentence, return the corresponding ThingTalk code.

```
POST /en-US/query
Host: nlp.almond.stanford.edu
Content-Type: application/json

{
  "q": "get a cat picture",
  "thingtalk_version": "1.9.0",
  "store": "yes"
}

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "result": "ok",
  "candidates": [
    {
      code: ["now", "=>", "@com.thecatapi.get", "=>", "notify"],
      score: 1.0
    }
  ],
  "tokens": ["get", "a", "cat", "picture"],
  "entities": {},
  "intent": {
    "question": 0,
    "command": 1,
    "chatty": 0,
    "other": 0
  }
}
```

### Parameters

All parameters are optional except for `q`. `thingtalk_version` is optional for compatibility reasons but strongly recommended.

- `q` : the input from the user
- `thingtalk_version`: the version of ThingTalk used by the client application; use this parameter to ensure that the produced code is compatible with the client
- `store`: one of `yes`, `no`; controls whether the sentence can be stored for analysis and research; defaults to `no` if not provided
- `limit`: maximum number of candidate parses to return; note that, depending on the model, the actual number might be lower
- `expect`: what type the client is expecting; currently, the only recognized values are `Location` and `MultipleChoice`
- `choices`: an array of strings indicating the possible options the user is choosing from; this is ignored unless `expect` is set to `MultipleChoice`
- `context`: the current state of the dialogue agent, as a ThingTalk string in neural network syntax; this is used only for contextual (multi-turn) NLP models, which are experimental and not yet supported
- `entities`: entities present in the context
- `tokenized` (boolean): if specified, the input from the user is assumed to be already tokenized; this is used primarily to evaluate a trained against a dataset that was already preprocessed
- `skip_typechecking` (boolean): if specified, the server will not check syntax and types of the produced parses, returning the raw result from the neural model; this is only useful during evaluation, and you must have an admin-level developer key to use this option
- `access_token`: access token to control access to a private NLP model
- `developer_key`: Thingpedia developer key to use to access unpublished devices

### Response fields

- `result`: either `ok`, or absent in case of an error
- `candidates`: an array of candidate parses, sorted from the most to the least likely
- `candidates[].code`: the ThingTalk code of the candidate parse, as an array of tokens
- `candidates[].score`: the likelihood score of the parse; the special value `Infinity` indicates that the sentence was matched exactly instead of using a neural model
- `tokens`: tokenized input from the user
- `entities`: entities extracted from the user's input
- `intent`: high-level intent of the user's input
- `intent.command`: likelihood that the user's input was a command or question that can be interpreted in ThingTalk; `candidates` should be considered unreliable unless `intent.command` has high-score
- `intent.question`: likelihood that the user's input was an open-domain question suitable for a search engine
- `intent.chatty`: likelihood that the user's input was chatty text (unsupported)
- `intent.other`: likelihood that the user's input was not in any of the other categories

## Speech-to-Text: /voice/stt

Converts an audio file containing speech to the text representation.

```
POST /en-US/voice/stt
Host: nlp.almond.stanford.edu
Content-Type: multipart/form-data; boundary=XXXXX

--XXXX
Content-Type: audio/x-wav
Content-Disposition: form-data; name="audio"; filename="audio.wav"

... raw audio data ...

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "result": "ok",
  "text": "Recognized text."
}
```

The body of the request must contain a `.wav` file with the correct MIME type `audio/x-wav` in a field named `audio`.
The filename must be specified, but can have any value.
The wav file needs to have a sample rate of 16000 Hz, and must be in PCM mono format, encoded as 16 bit signed little-endian.

### Response fields

- `result`: either `ok`, or absent in case of an error
- `text`: the recognized text, capitalized and punctuated correctly

## Combined Speech-to-Text and NLU: /voice/query

Converts an audio file containing speech to the ThingTalk interpretation, in one step.
This combines the `/voice/stt` and `/query` APIs

```
POST /en-US/voice/query
Host: nlp.almond.stanford.edu
Content-Type: multipart/form-data; boundary=XXXXX

--XXXX
Content-Type: audio/x-wav
Content-Disposition: form-data; name="audio"; filename="audio.wav"

... raw audio data ...

--XXXX
Content-Disposition: form-data; name="metadata"

{"thingtalk_version": "1.9.0", "store": "yes"}

--XXXX--

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "result": "ok",
  "text": "Recognized text.",
  "candidates": [
    {
      code: ["now", "=>", "@com.thecatapi.get", "=>", "notify"],
      score: 1.0
    }
  ],
  "tokens": ["get", "a", "cat", "picture"],
  "entities": {},
  "intent": {
    "question": 0,
    "command": 1,
    "chatty": 0,
    "other": 0
  }
}
```

The body of the request must contain a `.wav` file with the correct MIME type `audio/x-wav` in a field named `audio`.
The filename must be specified, but can have any value.
The wav file needs to have a sample rate of 16000 Hz, and must be in PCM mono format, encoded as 16 bit signed little-endian.

The request must also contain a field called `metadata`, containing a JSON payload with the request parameters to the `/query` endpoint (except for `q`). The meaning of the parameters is the same.

The response returns the same parameters as `/query`, with the addition of `text`, which is the raw extracted text from the sound file. 

## Text-to-Speech: /voice/tts

Convert text to an audio file.

```
POST /en-US/voice/stt
Host: nlp.almond.stanford.edu
Content-Type: application/json

{
  "text": "Text to convert to speech."
}

HTTP/1.1 200 Ok
Content-Type: audio/x-wav

... raw audio data...
```

The request returns the generated audio file directly.

## Preprocessing: /tokenize

Tokenizes and preprocesses a sentence, extracting numbers, dates, times, etc.

```
POST /en-US/tokenize
Host: nlp.almond.stanford.edu
Content-Type: application/json

{
  "q": "wake me up at 7 am with 3 cat pictures"
}

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "result": "ok",
  "tokens": ["wake", "me", "up", "at", "TIME_0", "with", "NUMBER_0", "cat", "pictures"],
  "entities": {
    "TIME_0": { "hour": 7, "minute": 0, "second": 0 },
    "NUMBER_0": 3
  },
  "raw_tokens": ["wake", "me", "up", "at", "7", "am", "with", "3", "cat", "pictures"],
  "pos_tags": ["VB", "PRP", "RP", "IN", "CD", "VBP", "IN", "CD", "NN", "NNS"],
  "sentiment": "neutral"
}
```

### Parameters

All parameters are optional except for `q`.

- `q` : the input from the user
- `expect`: what type the client is expecting; the values are the same as the `/query` API
- `entities`: other entities already present in the context

### Response fields

- `result`: either `ok`, or absent in case of an error
- `tokens`: the tokenization of the input sentence
- `entities`: entities extracted from the sentence; this is an object with one key for each upper-case token in `tokens`
- `raw_tokens`: the tokenization of the input sentence, before recognizing entities
- `pos_tags`: part-of-speech tagging of the input sentence; this is an array with the same length as `raw_tokens`; the tagset is locale-dependent (Penn Treebank for English)
- `sentiment`: sentiment classification of the sentence; one of `very_negative`, `negative`, `neutral`, `positive`, `very_positive`; not all locales support this, in which case the sentiment will always be `neutral`

## Online Learning: /learn

This API trains the model interactively, and stores the new sentence for later retraining.

```
POST /en-US/learn
Host: nlp.almond.stanford.edu
Content-Type: application/json

{
  "q": "get a cat picture",
  "target": "now => @com.thecatapi.get => notify",
  "thingtalk_version": "1.9.0",
  "store": "online"
}

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "result": "ok",
  "message": "Learnt successfully",
  "example_id": 123456
}
```

### Parameters

- `q` (required) : the input from the user
- `target` (required): the ThingTalk code corresponding to this input from the user, in neural network syntax, with tokens separated by a single space
- `thingtalk_version` (required): the version of ThingTalk used by the client application; this must be _exactly_ the same version as the server is using, or the request will have no effect
- `store`: one of `no`, `automatic`, `online`, `commandpedia`; indicates the provenance of the sentence, which affects how it is stored and how it is used for training; if store is `no`, then the request checks that the code is compatible with the sentence, but has no persistent effects; defaults to `automatic`
- `access_token`: access token to control access to a private NLP model
- `developer_key`: Thingpedia developer key to use to access unpublished devices
- `owner`: an opaque string identifying the user that wrote this sentence; this can be used to support deletion of sentences from the training set, for example for compliance purposes

### Response fields

- `result`: `ok` on success, or absent on failure
- `message`: a human-readable string indicating what actually happened to the sentence
- `example_id`: if the sentence was added to the database, this is the ID of the newly created training example
