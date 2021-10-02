// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Euirim Choi <euirim@cs.stanford.edu>

import * as Tp from "thingpedia";
import * as fs from "fs";
import xmlbuilder from "xmlbuilder";
import * as http from "http";
import * as https from "https";
import WebSocket from "ws";
import {
  AudioInputStream,
  ResultReason,
  AudioConfig,
  SpeechConfig,
  SpeechRecognizer,
} from "microsoft-cognitiveservices-speech-sdk";
import * as wav from "wav";

import * as Config from "../../config";

class SpeechToTextFailureError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class SpeechToText {
  private _locale: string;

  constructor(locale: string) {
    this._locale = locale;
  }

  private _initRecognizer(sdkInputStream: AudioInputStream) {
    const audioConfig = AudioConfig.fromStreamInput(sdkInputStream);
    const speechConfig = SpeechConfig.fromSubscription(
      Config.MS_SPEECH_SUBSCRIPTION_KEY!,
      Config.MS_SPEECH_SERVICE_REGION!
    );
    speechConfig.speechRecognitionLanguage = this._locale;

    // Recognizer settings
    return new SpeechRecognizer(speechConfig, audioConfig);
  }

  async recognizeOnce(wavFilename: string): Promise<string> {
    const sdkAudioInputStream = AudioInputStream.createPushStream();
    const recognizer = this._initRecognizer(sdkAudioInputStream);

    return new Promise((resolve, reject) => {
      recognizer.recognized = (_, e) => {
        // Indicates that recognizable speech was not detected, and that
        // recognition is done.
        if (e.result.reason === ResultReason.NoMatch)
          reject(
            new SpeechToTextFailureError(
              400,
              "E_NO_MATCH",
              "Speech unrecognizable."
            )
          );
      };

      recognizer.recognizeOnceAsync(
        (result) => {
          resolve(result.text);
          recognizer.close();
        },
        () => {
          reject(
            new SpeechToTextFailureError(
              500,
              "E_INTERNAL_ERROR",
              "Speech recognition failed due to internal error."
            )
          );
          recognizer.close();
        }
      );

      const fileStream = fs.createReadStream(wavFilename);
      const wavReader = new wav.Reader();
      wavReader.on("format", (format) => {
        wavReader
          .on("data", (data) => {
            sdkAudioInputStream.write(data);
          })
          .on("end", () => {
            sdkAudioInputStream.close();
          });
      });
      wavReader.on("error", reject);

      fileStream.pipe(wavReader);
    });
  }

  async recognizeStream(stream: WebSocket) {
    const sdkAudioInputStream = AudioInputStream.createPushStream();
    const recognizer = this._initRecognizer(sdkAudioInputStream);

    return new Promise((resolve, reject) => {
      let fullText = "",
        lastFC = 0,
        timerLastFrame: NodeJS.Timeout,
        _ended = false;

      function stopRecognizer() {
        if (timerLastFrame) clearInterval(timerLastFrame);
        sdkAudioInputStream.close();
        _ended = true;
      }

      recognizer.recognized = (_, e) => {
        const result = e.result;
        const reason = result.reason;

        // Indicates that recognizable speech was not detected
        if (reason === ResultReason.NoMatch) recognizer.sessionStopped(_, e);
        // Add recognized text to fullText
        if (reason === ResultReason.RecognizedSpeech) fullText += result.text;
      };

      // Signals that the speech service has detected that speech has stopped.
      recognizer.sessionStopped = (_, e) => {
        if (timerLastFrame) clearInterval(timerLastFrame);
        recognizer.stopContinuousRecognitionAsync(
          () => {
            // Recognition stopped
            if (fullText) resolve(fullText);
            else
              reject(
                new SpeechToTextFailureError(
                  400,
                  "E_NO_MATCH",
                  "Speech unrecognizable."
                )
              );
            recognizer.close();
          },
          () => {
            reject(
              new SpeechToTextFailureError(
                500,
                "E_INTERNAL_ERROR",
                "Speech recognition failed due to internal error."
              )
            );
          }
        );
      };

      recognizer.startContinuousRecognitionAsync(
        () => {
          // Recognition started
          timerLastFrame = setInterval(() => {
            if (lastFC >= 2) stopRecognizer();
            lastFC++;
          }, 500);
        },
        () => {
          reject(
            new SpeechToTextFailureError(
              500,
              "E_INTERNAL_ERROR",
              "Speech recognition failed due to internal error."
            )
          );
          recognizer.close();
        }
      );

      stream
        .on("message", (data: Buffer) => {
          if (data.length) {
            if (!_ended) sdkAudioInputStream.write(data);
            lastFC = 0;
          } else {
            stopRecognizer();
          }
        })
        .on("end", () => {
          stopRecognizer();
        });
    });
  }
}

const VOICES: Record<string, { male: string; female: string }> = {
  "en-us": {
    male: "GuyNeural",
    female: "AriaNeural",
  },
};

/**
 * Default period between TTS access token refreshes, in milliseconds. Access
 * tokens are good for 10 minutes:
 *
 * https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/rest-text-to-speech#authentication
 *
 * So I've chosen 8 minutes.
 */
const TTS_DEFAULT_TOKEN_REFRESH_MS = 8 * 60 * 1000;

class TextToSpeech {
  public readonly URL = `https://${Config.MS_SPEECH_SERVICE_REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;

  private _accessToken: null | string;
  private _accessTokenPromise: Promise<string>;
  private _tokenRefresh_ms: number;

  constructor({
    tokenRefresh_ms = TTS_DEFAULT_TOKEN_REFRESH_MS,
  }: {
    tokenRefresh_ms?: number;
  } = {}) {
    this._accessToken = null;
    this._accessTokenPromise = this.retrieveAccessToken();
    this._tokenRefresh_ms = tokenRefresh_ms;
  }

  retrieveAccessToken(): Promise<string> {
    console.log(`TextToSpeech.retrieveAccessToken() START`);
    return Tp.Helpers.Http.post(this.URL, "", {
      extraHeaders: {
        "Ocp-Apim-Subscription-Key": Config.MS_SPEECH_SUBSCRIPTION_KEY!,
      },
    }).then((accessToken: string) => {
      console.log(`TextToSpeech.retrieveAccessToken() DONE`);
      this._accessToken = accessToken;
      console.log(`Scheduling refresh in ${this._tokenRefresh_ms} ms...`);
      setTimeout(this.retrieveAccessToken.bind(this), this._tokenRefresh_ms);
      return accessToken;
    });
  }

  async getAccessToken(): Promise<string> {
    console.log(`TextToSpeech.getAccessToken() START`);
    if (typeof this._accessToken === "string") {
      console.log(`this._accessToken present, returning (FAST)`);
      return this._accessToken;
    }
    console.log(`this._accessToken absent, awaiting promise (SLOW)`);
    return this._accessTokenPromise;
  }

  async request(
    locale: string,
    gender: "male" | "female" = "male",
    text: string
  ) {
    const accessToken = await this.getAccessToken();
    // Create the SSML request.
    const xmlBody = xmlbuilder
      .create("speak")
      .att("version", "1.0")
      .att("xml:lang", locale)
      .ele("voice")
      .att("xml:lang", locale)
      .att("name", locale + "-" + VOICES[locale.toLowerCase()][gender])
      .txt(text)
      .end();
    // Convert the XML into a string to send in the TTS request.
    const body = xmlBody.toString();

    return new Promise<http.IncomingMessage>((resolve, reject) => {
      const options = {
        protocol: "https:",
        hostname: `${Config.MS_SPEECH_SERVICE_REGION}.tts.speech.microsoft.com`,
        port: 443,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/ssml+xml",
          "User-Agent": "YOUR_RESOURCE_NAME",
          "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
          "cache-control": "no-cache",
        },
        method: "POST",
        path: "/cognitiveservices/v1",
      };
      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          // this error will be logged, and the client will see a 500 error
          reject(new Error(`Unexpected HTTP error ${res.statusCode}`));
          return;
        }
        resolve(res);
      });
      req.on("error", reject);
      req.end(body);
    });
  }
}

export { SpeechToText, TextToSpeech };
