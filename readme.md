# hallo client

Simple webrtc client for [hallo-server](https://www.npmjs.com/package/hallo-server).

## usage

```javascript
const iceServers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302'}]
}
const hallo = new HalloClient(iceServers)

const showWebcam = () => navigator.mediaDevices.getUserMedia({ audio: false, video: true })
const showMonitor = () => navigator.mediaDevices.getDisplayMedia({ video: {displaySurface: "monitor"} })

hallo.join("a_room", showWebcam, {
  addLocalStream: (stream) => doStuff(),
  addRemoteStream: (stream) => doStuff(),
  removeRemoteStream: (stream) => doStuff()
})

/*
...
*/

hallo.changeMediaLambda(showMonitor)

/*
...
*/

hallo.leave()
```