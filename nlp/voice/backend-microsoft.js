// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Euirim Choi <euirim@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Tp = require('thingpedia');
const fs = require('fs');
const xmlbuilder = require('xmlbuilder');
const https = require('https');
const {
  AudioInputStream,
  ResultReason,
  AudioConfig,
  SpeechConfig,
  SpeechRecognizer,
} = require('@euirim/microsoft-cognitiveservices-speech-sdk');
const wav = require('wav');

const Config = require('../../config');

class SpeechToTextFailureError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

class SpeechToText {
    constructor(locale) {
        this._locale = locale;
    }

    _initRecognizer(sdkInputStream) {
        const audioConfig = AudioConfig.fromStreamInput(sdkInputStream);
        const speechConfig = SpeechConfig.fromSubscription(
            Config.MS_SPEECH_SUBSCRIPTION_KEY,
            Config.MS_SPEECH_SERVICE_REGION,
        );
        speechConfig.speechRecognitionLanguage = this._locale;

        // Recognizer settings
        return new SpeechRecognizer(speechConfig, audioConfig);
    }

    async recognizeOnce(wavFilename) {
        const sdkAudioInputStream = AudioInputStream.createPushStream();
        const recognizer = this._initRecognizer(sdkAudioInputStream);

        return new Promise((resolve, reject) => {
            recognizer.recognized = (_, e) => {
                // Indicates that recognizable speech was not detected, and that recognition is done.
                if (e.result.reason === ResultReason.NoMatch)
                    reject(new SpeechToTextFailureError(400, 'E_NO_MATCH', 'Speech unrecognizable.'));
            };

            recognizer.recognizeOnceAsync((result) => {
                resolve(result.text);
                recognizer.close();
            }, () => {
                reject(new SpeechToTextFailureError(500, 'E_INTERNAL_ERROR', 'Speech recognition failed due to internal error.'));
                recognizer.close();
            });

            const fileStream = fs.createReadStream(wavFilename);
            const wavReader = new wav.Reader();
            wavReader.on('format', (format) => {
                console.log(format);
                wavReader.on('data', (data) => {
                    sdkAudioInputStream.write(data);
                }).on('end', () => {
                    sdkAudioInputStream.close();
                });
            });
            wavReader.on('error', reject);

            fileStream.pipe(wavReader);
        });
    }
}

async function getTTSAccessToken() {
    const url = 'https://westus2.api.cognitive.microsoft.com/sts/v1.0/issuetoken';
    return Tp.Helpers.Http.post(url, '', {
        extraHeaders: {
            'Ocp-Apim-Subscription-Key': Config.MS_SPEECH_SUBSCRIPTION_KEY,
        },
    });
}

async function textToSpeech(text) {
    const accessToken = await getTTSAccessToken();
    // Create the SSML request.
    const xmlBody = xmlbuilder
        .create('speak')
        .att('version', '1.0')
        .att('xml:lang', 'en-us')
        .ele('voice')
        .att('xml:lang', 'en-us')
        .att(
          'name',
          'Microsoft Server Speech Text to Speech Voice (en-US, GuyNeural)',
        )
        .txt(text)
        .end();
    // Convert the XML into a string to send in the TTS request.
    const body = xmlBody.toString();

    return new Promise((resolve, reject) => {
        const options = {
            protocol: 'https:',
            hostname: 'westus2.tts.speech.microsoft.com',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/ssml+xml',
                'User-Agent': 'YOUR_RESOURCE_NAME',
                'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
                'cache-control': 'no-cache',
            },
            method: 'POST',
            path: 'cognitiveservices/v1',
        };
        const req = https.request(options, (err, response) => {
            if (err)
                reject(err);
            else
                resolve(response);
        });
        req.end(body);
    });
}

module.exports = {
    SpeechToText,
    textToSpeech
};
