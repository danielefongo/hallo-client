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

// Prepare event handlers
hallo.on('joined', ({username, room, id}) => doStuff())
hallo.on('left', ({username, room, id}) => doStuff())
hallo.on('already_joined', ({username, room, id}) => doStuff())

hallo.on('add_remote_track', ({username, track}) => doStuff())
hallo.on('remove_remote_track', ({username, track}) => doStuff())

hallo.on('add_local_track', ({username, track}) => doStuff())
hallo.on('remove_local_track', ({username, track}) => doStuff())

hallo.on('message', (message) => doStuff())

// Join room
hallo.join("username", "a_room", showWebcam)

// Send message
hallo.send("another_username", {message: "hallo!"})

// Leave room
hallo.leave()
```