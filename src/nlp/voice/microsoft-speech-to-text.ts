import {
  AudioInputStream,
  ResultReason,
  AudioConfig,
  SpeechConfig,
  SpeechRecognizer,
  Recognizer,
  SpeechRecognitionEventArgs,
  SessionEventArgs,
  PushAudioInputStream,
} from "microsoft-cognitiveservices-speech-sdk";
import WebSocket from "ws";
import { Logger } from "@stanford-oval/logging";
import * as Winston from "winston";

import * as Config from "../../config";
import Logging from "../../logging";

const LOG = Logging.get(__filename);
const DEFAULT_INPUT_READ_TIMEOUT_INTERVAL_MS = 500;
const DEFAULT_INPUT_READ_TIMEOUT_MAX_COUNT = 2;

export class SpeechToTextFailureError extends Error {
    status : number;
    code : string;

    constructor(status : number, code : string, message : string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export class MicrosoftSpeechToTextStream {
    protected _audioInputStream : PushAudioInputStream;
    protected _input : WebSocket;
    protected _lastInputAt ?: number;
    protected _locale : string;
    protected _log : Logger.TLogger;
    protected _profiler ?: Winston.Profiler;
    protected _recognizer : SpeechRecognizer;
    protected _recognizerClosed = false;
    protected _recognizerStopped = false;
    protected _resultTexts : string[];
    protected _inputReadTimeoutHandle ?: NodeJS.Timeout;
    protected _inputReadTimeoutIntervalMs : number;
    protected _inputReadTimeoutMaxCount : number;
    protected _inputReadTimeoutCount = 0;
    protected _wakeWordPattern : RegExp;
    protected _wakeWordDetected = false;

    protected _resolve ?: (text : string | PromiseLike<string>) => void;
    protected _reject ?: (reason ?: any) => void;

    constructor({
        locale,
        input,
        wakeWordPattern,
        inputReadTimeoutIntervalMs = DEFAULT_INPUT_READ_TIMEOUT_INTERVAL_MS,
        inputReadTimeoutMaxCount = DEFAULT_INPUT_READ_TIMEOUT_MAX_COUNT,
    } : {
        locale : string;
        input : WebSocket;
        wakeWordPattern : RegExp;
        inputReadTimeoutIntervalMs ?: number;
        inputReadTimeoutMaxCount ?: number;
    }) {
        this._locale = locale;
        this._log = LOG.childFor(MicrosoftSpeechToTextStream, {
            locale: this._locale,
        });
        this._resultTexts = [];
        this._input = input;
        this._inputReadTimeoutIntervalMs = inputReadTimeoutIntervalMs;
        this._inputReadTimeoutMaxCount = inputReadTimeoutMaxCount;
        this._wakeWordPattern = wakeWordPattern;

        this._audioInputStream = AudioInputStream.createPushStream();
        const audioConfig = AudioConfig.fromStreamInput(this._audioInputStream);
        const speechConfig = SpeechConfig.fromSubscription(
            Config.MS_SPEECH_SUBSCRIPTION_KEY!,
            Config.MS_SPEECH_SERVICE_REGION!
        );
        speechConfig.speechRecognitionLanguage = this._locale;

        this._recognizer = new SpeechRecognizer(speechConfig, audioConfig);
        this._recognizer.recognized = this._onRecognized.bind(this);
        this._recognizer.sessionStopped = this._onSessionStopped.bind(this);
    }
    
    public async recognize() : Promise<string> {
        this._profile("Starting recognition...");
        try {
            this._startContinuousRecognitionAsync();
        } catch(error : any) {
            this._fail(
                new SpeechToTextFailureError(
                    500,
                    "E_INTERNAL_ERROR",
                    "Speech recognition failed due to internal error."
                )
            );
        }
        
        this._profile("Recognition started");
        this._startInputReadTimeout();
        this._input.on("message", this._onInputMessage.bind(this));
        this._input.on("end", this._onInputEnd.bind(this));
        
        return new Promise<string>((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }
    
    protected _onInputMessage(data : Buffer) : void {
        this._lastInputAt = Date.now();
        this._inputReadTimeoutCount = 0;
        
        if (this._recognizerStopped) {
            this._log.warn(
                "Received input message but recognizer already stopped, " +
                "ignoring..."
            );
            return;
        }
        
        if (data.length === 0) {
            this._profile("Input stream terminated (empty frame received)");
            this._stopRecognizer();
            return;
        }
        
        this._audioInputStream.write(data);
    }
    
    protected _onInputEnd() : void {
        this._profile("Input stream ended");
        this._stopRecognizer();
    }
    
    protected _startInputReadTimeout() {
        if (this._inputReadTimeoutHandle) {
            this._log.warn(
                "Input timeout handle is already set, ignoring start call..."
            );
            return;
        }
        this._inputReadTimeoutHandle = setInterval(
            this._checkInputReadTimeout.bind(this),
            this._inputReadTimeoutIntervalMs,
        );
        this._log.debug("Input read timeout started.");
    }
    
    protected _checkInputReadTimeout() {
        if (this._inputReadTimeoutCount >= this._inputReadTimeoutMaxCount) {
            this._profile("Timed out");
            this._stopRecognizer();
        }
        this._inputReadTimeoutCount += 1;
    }
    
    protected _clearInputReadTimeout() {
        if (this._inputReadTimeoutHandle) {
            clearInterval(this._inputReadTimeoutHandle);
            this._inputReadTimeoutHandle = undefined;
        }
    }
    
    protected _stopRecognizer() {
        if (this._recognizerStopped) {
            this._log.warn("Recognizer already stopped.");
        } else {
            this._recognizerStopped = true;
            this._profile("Stopping recognizer...");
            this._clearInputReadTimeout();
            this._audioInputStream.close();
        }
    }
    
    protected _closeRecognizer() {
        if (!this._recognizerClosed) {
            this._recognizer.close();
            this._recognizerClosed = true;
        }
    }
    
    protected _cleanup() {
        this._clearInputReadTimeout();
        this._closeRecognizer();
    }
    
    protected _complete(text : string) : void {
        if (!this._resolve) 
            throw new Error(`Can not complete, no this._resolve!`);
        this._cleanup();
        this._resolve(text);
    }
    
    protected _fail(error : SpeechToTextFailureError) : void {
        this._profile("FAILED", error);
        this._cleanup();
        if (this._reject) return this._reject(error);
        throw error;
    }

    protected _profile(message : string, meta : any = {}) {
        if (!this._profiler) 
            this._profiler = this._log.startTimer();
        this._profiler.done({
            level: "info",
            message,
            ...meta
        });
        this._profiler = this._log.startTimer();
    }

    protected _onRecognized(
        sender : Recognizer,
        event : SpeechRecognitionEventArgs
    ) : void {
        switch (event.result.reason) {
            case ResultReason.NoMatch:
                // Indicates that recognizable speech was not detected
                this._profile("No match");
                this._recognizer.sessionStopped(sender, event);
                break;
            // case ResultReason.RecognizingSpeech:
            //     this._log.info("HYPOTHESIS speech", event.result);
            //     break;
            case ResultReason.RecognizedSpeech:
                // Add recognized text to fullText
                this._resultTexts.push(event.result.text);
                this._profile("Recognized speech", {
                    text: event.result.text,
                    resultTexts: this._resultTexts,
                }); 
                this._checkWakeWord();
                break;
        }
    }
    
    protected _checkWakeWord() : void {
        if (this._wakeWordDetected) return;
        
        const text = this._resultTexts[0];
        const match = text.match(this._wakeWordPattern);
        
        if (!match) {
            this._profile("Wake word check FAILED", {
                text,
                pattern: this._wakeWordPattern.source
            });
            
            this._fail(
                new SpeechToTextFailureError(
                    400,
                    "E_NO_MATCH",
                    "No wake word"
                )
            );
            return;
        }
        
        this._wakeWordDetected = true;
        
        if (match[0].length === text.length) 
            this._resultTexts.shift();
         else 
            this._resultTexts[0] = text.slice(match[0].length);
    }
    
    protected _startContinuousRecognitionAsync() : Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._recognizer.startContinuousRecognitionAsync(resolve, reject);
        });
    }
    
    protected _stopContinuousRecognitionAsync() : Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this._recognizer.stopContinuousRecognitionAsync(resolve, reject);
        });
    }

    protected async _onSessionStopped(
        sender : Recognizer,
        event : SessionEventArgs
    ) : Promise<void> {
        this._clearInputReadTimeout();
        
        try {
            await this._stopContinuousRecognitionAsync();
        } catch(error : any) {
            // In _this_ case, the recognizer is closed on it's own, so we need
            // to be sure not to try and close it again
            this._recognizerClosed = true;
            return this._fail(
                new SpeechToTextFailureError(
                    500,
                    "E_INTERNAL_ERROR",
                    "Speech recognition failed due to internal error."
                )
            );
        }
        
        if (this._resultTexts.length === 0) {
            return this._fail(
                new SpeechToTextFailureError(
                    400,
                    "E_NO_MATCH",
                    "Speech unrecognizable."
                )
            );
        }
        
        return this._complete(this._resultTexts.join(" "));
    }

}
