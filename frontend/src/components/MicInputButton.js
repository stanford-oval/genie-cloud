import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Button from 'react-bootstrap/Button';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMicrophone,
  faMicrophoneSlash,
} from '@fortawesome/free-solid-svg-icons';

import Recorder from '../libs/recorder';

const MicInputButton = props => {
  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState(null);
  const [recorder, setRecorder] = useState(null);

  const createDownload = false; // Set to true for a quick demo that the recorder is working

  // Demo to show that recorder is working
  const createDownloadLink = blob => {
    const micInputButton = document.getElementById('micInputButton');
    const url = URL.createObjectURL(blob);
    const au = document.createElement('audio');
    const item = document.createElement('div');
    const link = document.createElement('a');
    // add controls to the <audio> element
    au.controls = true;
    au.src = url;
    // link the a element to the blob
    link.href = url;
    link.download = new Date().toISOString() + '.wav';
    link.innerHTML = link.download;
    // add the new audio and a elements to the li element
    item.appendChild(au);
    item.appendChild(link);
    // add item to reactContainer
    micInputButton.appendChild(item);
    // update command
    props.setCommand('some transcribed utterance');
  };

  // POST request to send audio file
  const postAudio = blob => {
    const data = new FormData();
    data.append('audio', blob);
    axios({
      method: 'post',
      url: 'http://127.0.0.1:4000/audio', // TODO : Modify POST URL here
      data: data,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
      .then(response => {
        if (response.data.success) props.setCommand(response.data.command);
        // Update command
        else console.log(response.data.command);
      })
      .catch(error => {
        // handle error
        console.log(error);
        console.log(error.data);
      });
  };

  const startStopRecord = () => {
    if (!isRecording) {
      // Start recording
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then(strm => {
          console.log(
            'getUserMedia() success, stream created, initializing Recorder.js ...',
          );
          const audioContext = new (window.AudioContext ||
            window.webkitAudioContext)();
          const rec = new Recorder(audioContext.createMediaStreamSource(strm), {
            numChannels: 1,
          });
          rec.record();
          console.log('Recording started');
          // Update state
          setIsRecording(true);
          setStream(strm);
          setRecorder(rec);
        })
        .catch(err => {
          console.log('Recording failed');
          console.log(err);
          alert("You don't seem to have a recording device enabled!");
        });
    } else {
      // Stop recording
      recorder.stop();
      stream.getAudioTracks()[0].stop();
      recorder.exportWAV(blob => {
        // switch this call with next call for sending audio via POST
        if (createDownload) createDownloadLink(blob);
        else postAudio(blob);
      });
      setIsRecording(false);
    }
  };

  return (
    <div id="micInputButton">
      <FontAwesomeIcon
        icon={isRecording ? faMicrophone : faMicrophoneSlash}
        color={isRecording ? 'red' : 'grey'}
        size="2x"
      />
      <Button variant="primary" onClick={startStopRecord}>
        {isRecording ? 'Stop Recording' : 'Record'}
      </Button>
    </div>
  );
};

MicInputButton.propTypes = {
  setCommand: PropTypes.func,
};

export default MicInputButton;
