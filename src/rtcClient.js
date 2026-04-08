import { Device } from 'mediasoup-client';
import { getJson, postJson } from './api';

async function consumeKind(transport, device, kind) {
  const params = await postJson('/rtc/consume', {
    transportId: transport.id,
    kind,
    rtpCapabilities: device.rtpCapabilities
  });

  return transport.consume({
    id: params.id,
    producerId: params.producerId,
    kind: params.kind,
    rtpParameters: params.rtpParameters
  });
}

export async function connectRtcPreview() {
  const routerRtpCapabilities = await getJson('/rtc/router-capabilities');
  const device = new Device();
  await device.load({ routerRtpCapabilities });

  const transportOptions = await postJson('/rtc/transports');
  const transport = device.createRecvTransport(transportOptions);

  transport.on('connect', ({ dtlsParameters }, callback, errback) => {
    postJson(`/rtc/transports/${transport.id}/connect`, { dtlsParameters })
      .then(() => {
        callback();
      })
      .catch((error) => {
        errback(error);
      });
  });

  const stream = new MediaStream();
  let videoConsumer = null;
  let audioConsumer = null;
  const errors = [];

  try {
    videoConsumer = await consumeKind(transport, device, 'video');
    stream.addTrack(videoConsumer.track);
  } catch (error) {
    errors.push(error.message);
  }

  try {
    audioConsumer = await consumeKind(transport, device, 'audio');
    stream.addTrack(audioConsumer.track);
  } catch (error) {
    errors.push(error.message);
  }

  if (!videoConsumer && !audioConsumer) {
    transport.close();
    throw new Error(errors[0] || 'No remote producers are available yet.');
  }

  return {
    stream,
    transport,
    videoConsumer,
    audioConsumer
  };
}
