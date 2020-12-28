# hallo client

Simple webrtc client for [hallo-server](https://www.npmjs.com/package/hallo-server).

## usage

```javascript
const iceServers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302'}]
}

const showWebcam = () => navigator.mediaDevices.getUserMedia({ audio: false, video: true })
const showMonitor = () => navigator.mediaDevices.getDisplayMedia({ video: {displaySurface: "monitor"} })

// Create new client
const hallo = new HalloClient(iceServers)

// Join room
hallo.join("a_room", showWebcam, {
  addLocalTrack: (track) => doStuff(),
  removeLocalTrack: (track) => doStuff(),
  addRemoteTrack: (track) => doStuff(),
  removeRemoteTrack: (track) => doStuff()
})

// Update stream by using new UserMedia
hallo.changeMediaLambda(showMonitor)

// Update callbacks (useful in scenarios like React hooks)
hallo.changeCallbacks({
  addLocalTrack: (track) => doStuff(),
  removeLocalTrack: (track) => doStuff(),
  addRemoteTrack: (track) => doStuff(),
  removeRemoteTrack: (track) => doStuff()
})

// Leave room
hallo.leave()
```