// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

// [START iot_mqtt_include]
const { readFileSync } = require('fs');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');
const lit = require('lit-illumination-technology');

const mqttBridgeHostname = 'mqtt.googleapis.com';
const mqttBridgePort = 8883;
const algorithm = `RS256`;
const projectId = 'lit-illumination-technology';
const region = 'us-central1';
const registryId = 'lights';

// [END iot_mqtt_include]

// Create a Cloud IoT Core JWT for the given project id, signed with the given
// private key.
// [START iot_mqtt_jwt]
const createJwt = (projectId, privateKeyFile, algorithm) => {
  // Create a JWT to authenticate this device. The device will be disconnected
  // after the token expires, and will have to reconnect with a new token. The
  // audience field should always be set to the GCP project id.
  const token = {
    iat: parseInt(Date.now() / 1000),
    exp: parseInt(Date.now() / 1000) + 20 * 60, // 20 minutes
    aud: projectId,
  };
  const privateKey = readFileSync(privateKeyFile);
  return jwt.sign(token, privateKey, { algorithm: algorithm });
};
// [END iot_mqtt_jwt]

const litListen = (
  deviceId,
  privateKeyFile,
) => {
  // [START iot_mqtt_run]

  // const deviceId = `myDevice`;
  // const privateKeyFile = `./rsa_private.pem`;

  // The mqttClientId is a unique string that identifies this device. For Google
  // Cloud IoT Core, it must be in the format below.
  const mqttClientId = `projects/${projectId}/locations/${region}/registries/${registryId}/devices/${deviceId}`;

  // With Google Cloud IoT Core, the username field is ignored, however it must be
  // non-empty. The password field is used to transmit a JWT to authorize the
  // device. The "mqtts" protocol causes the library to connect using SSL, which
  // is required for Cloud IoT Core.
  const connectionArgs = {
    host: mqttBridgeHostname,
    port: mqttBridgePort,
    clientId: mqttClientId,
    username: 'unused',
    password: createJwt(projectId, privateKeyFile, algorithm),
    protocol: 'mqtts',
    secureProtocol: 'TLSv1_2_method',
  };

  // Create a client, and connect to the Google MQTT bridge.
  const iatTime = parseInt(Date.now() / 1000);
  const client = mqtt.connect(connectionArgs);

  // Subscribe to the /devices/{device-id}/config topic to receive config updates.
  // Config updates are recommended to use QoS 1 (at least once delivery)
  client.subscribe(`/devices/${deviceId}/config`, { qos: 1 });

  // Subscribe to the /devices/{device-id}/commands/# topic to receive all
  // commands or to the /devices/{device-id}/commands/<subfolder> to just receive
  // messages published to a specific commands folder; we recommend you use
  // QoS 0 (at most once delivery)
  client.subscribe(`/devices/${deviceId}/commands/#`, { qos: 0 });

  client.on('connect', success => {
    console.log('connected');
    if (!success) {
      console.log('Client not connected...');
    }
  });

  client.on('close', () => {
    console.log('close');
  });

  client.on('error', err => {
    console.log('error', err);
  });

  client.on('message', (topic, message) => {
    let messageStr = 'Message received: ';
    const data = Buffer.from(message, 'base64').toString('ascii');
    if (topic === `/devices/${deviceId}/config`) {
      messageStr = 'Config message received: ';
    } else if (topic.startsWith(`/devices/${deviceId}/commands`)) {
      if (topic.startsWith(`/devices/${deviceId}/commands/effects`)) {
        messageStr = 'Effect message received: ';
        const effectMsg = JSON.parse(data);
        const effect = effectMsg.effect;
        const args = effectMsg.args;
        const properties = effectMsg.properties;
        lit.start_effect(effect, args, properties, function(data, error) {
          if(error) {
              console.log("Lit error starting " + effect + " ("+JSON.stringify(args)+"): " + error);
          } else {
              console.log(`Lit response: ${JSON.stringify(data)}`);
          }
        })
      } else {
        messageStr = 'Unknown command received: ';
      }
    }
    messageStr += data
    console.log(messageStr);
  });

  client.on('packetsend', () => {
    // Note: logging packet send is very verbose
  });

  // [END iot_mqtt_run]
};

const { argv } = require('yargs')
  .options({
    deviceId: {
      description: 'Cloud IoT device ID.',
      requiresArg: true,
      demandOption: true,
      type: 'string',
    },
    privateKeyFile: {
      description: 'Path to private key file.',
      requiresArg: true,
      demandOption: true,
      type: 'string',
    },
  })
  .command(
    'litListen',
    'Listen for commands',
    {
    },
    opts => {
      litListen(
        opts.deviceId,
        opts.privateKeyFile,
      );
    }
  )
  .example(
    'node $0 litListen --deviceId=my-node-device --privateKeyFile=../rsa_private.pem'
  )
  .wrap(120)
  .recommendCommands()
  .help()
  .strict();
