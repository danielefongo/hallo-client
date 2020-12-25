import io from "socket.io-client";

class HalloClient {
  constructor(iceServers) {
    this.socket = io()
    this.peers = {}
    this.room = undefined
    this.localStream = undefined
    this.iceServers = iceServers
  }

  join(room, mediaLambda, callbacks) {
    if (!room) throw new Error("Invalid room")

    this.room = room
    this.mediaLambda = mediaLambda
    this.changeCallbacks(callbacks)
    this.prepareSocket()
    this.socket.emit('hallo_join', room)
  }

  leave() {
    this.socket.emit('hallo_left', this.room)
  }

  changeCallbacks(callbacks) {
    this.callbacks = callbacks
  }

  async changeMediaLambda(mediaLambda) {
    this.mediaLambda = mediaLambda
    await this.loadStream()
    this.replaceLocalTracksForAll()
  }

  prepareSocket() {
    this.socket.on('hallo_created', async () => {
      await this.loadStream()
    })

    this.socket.on('hallo_joined', async () => {
      await this.loadStream()
      this.socket.emit('hallo_new_peer', this.room)
    })

    this.socket.on('hallo_left', async (peerId) => {
      this.callbacks.removeRemoteStream(this.peers[peerId].stream)
      this.peers[peerId].close()
      delete this.peers[peerId]
    })

    this.socket.on('hallo_new_peer', async (peerId) => {
      this.newPeer(peerId)
    })

    this.socket.on('hallo_offer', async (peerId, event) => {
      if(!this.peers[peerId]) {
        this.newPeer(peerId)
      }
      this.addRemote(peerId, event)
      await this.createAnswer(peerId)
    })

    this.socket.on('hallo_answer', (peerId, event) => {
      this.addRemote(peerId, event)
    })

    this.socket.on('hallo_candidate', (peerId, event) => {
      var candidate = new RTCIceCandidate(event.candidate)
      this.peers[peerId].addIceCandidate(candidate)
    })
  }

  async loadStream() {
    try {
      const stream = await this.mediaLambda()
      this.setLocalStream(stream)
      this.callbacks.addLocalStream(this.localStream)
    } catch (error) {
      console.error('Could not get user media', error)
    }
  }

  newPeer(peerId) {
    const peer = new RTCPeerConnection(this.iceServers)
    this.peers[peerId] = peer

    this.addLocalTracks(peerId)

    peer.ontrack = ({streams}) => this.setRemoteStream(peerId, streams[0])
    peer.onicecandidate = (e) => this.sendIceCandidate(e, peerId)
    peer.onnegotiationneeded = () => this.createOffer(peerId)
  }

  addRemote(peerId, event) {
    this.peers[peerId].setRemoteDescription(new RTCSessionDescription(event))
  }

  async createOffer(peerId) {
    try {
      const sdp = await this.peers[peerId].createOffer()
      this.peers[peerId].setLocalDescription(sdp)

      this.socket.emit('hallo_offer', {sdp, peerId})
    } catch (error) {
      console.error(error)
    }
  }

  async createAnswer(peerId) {
    try {
      const sdp = await this.peers[peerId].createAnswer()
      this.peers[peerId].setLocalDescription(sdp)

      this.socket.emit('hallo_answer', {sdp, peerId})
    } catch (error) {
      console.error(error)
    }
  }

  sendIceCandidate(event, peerId) {
    if (event.candidate) {
      this.socket.emit('hallo_candidate', {candidate: event.candidate, peerId})
    }
  }

  setLocalStream(stream) {
    this.localStream = new MediaStream([
      stream.getVideoTracks()[0] || black(),
      stream.getAudioTracks()[0] || silence()
    ])
  }

  setRemoteStream(peerId, stream) {
    this.peers[peerId].stream = stream
    this.callbacks.addRemoteStream(stream)
  }

  addLocalTracks(peerId) {
    this.localStream.getTracks().forEach((track) => {
      this.peers[peerId].addTrack(track, this.localStream)
    })
  }

  replaceLocalTracksForAll() {
    Object.values(this.peers).forEach(peer => {
      peer.getSenders().forEach(sender => {
        const track = this.localStream.getTracks().find(it => it.kind == sender.track.kind)
        sender.replaceTrack(track)
      })
    })
  }
}

const silence = () => {
  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const stream = oscillator.connect(context.createMediaStreamDestination()).stream

  oscillator.start()

  return Object.assign(stream.getAudioTracks()[0], {enabled: false});
}

const black = ({width = 480, height = 270} = {}) => {
  const canvas = Object.assign(document.createElement("canvas"), {width, height});
  canvas.getContext('2d').fillRect(0, 0, width, height);

  const stream = canvas.captureStream()

  return Object.assign(stream.getVideoTracks()[0], {enabled: false});
}

export default HalloClient