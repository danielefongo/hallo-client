# hallo client

Simple webrtc client for [hallo-server](https://www.npmjs.com/package/hallo-server).

## usage

```javascript
const mediaConstraints = {
  audio: true,
  video: { width: 1280, height: 720 },
}

const iceServers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302'}]
}
const hallo = new HalloClient(iceServers)

hallo.join("a_room", mediaConstraints, {
  addLocalStream: (stream) => doStuff(),
  addRemoteStream: (stream) => doStuff(),
  removeRemoteStream: (stream) => doStuff()
})

/*
...
*/

hallo.changeConstraints({...mediaConstraints, audio: false})

/*
...
*/

hallo.leave()
```