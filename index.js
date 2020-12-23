import io from "socket.io-client";

class HalloClient {
  constructor(iceServers) {
    this.socket = io()
    this.peers = {}
    this.room = undefined
    this.localStream = undefined
    this.iceServers = iceServers
  }

  join(room, constraints, callbacks) {
    if (!room) throw new Error("Invalid room")

    this.room = room
    this.constraints = constraints
    this.callbacks = callbacks
    this.prepareSocket()
    this.socket.emit('hallo_join', room)
  }

  leave() {
    this.socket.emit('hallo_left', this.room)
  }

  async changeConstraints(constraints) {
    this.constraints = constraints
    await this.loadStream()
    this.addLocalTracksForAll()
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
      this.localStream = await navigator.mediaDevices.getUserMedia(this.constraints)
      this.callbacks.addLocalStream(this.localStream)
    } catch (error) {
      console.error('Could not get user media', error)
    }
  }

  newPeer(peerId) {
    const peer = new RTCPeerConnection(this.iceServers)
    this.peers[peerId] = peer

    this.addLocalTracks(peerId)

    peer.ontrack = ({streams}) => {
      if(peer.stream) {
        this.callbacks.removeRemoteStream(peer.stream)
      }
      peer.stream = streams[0]
      this.callbacks.addRemoteStream(streams[0])
    }
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

  addLocalTracksForAll() {
    Object.keys(this.peers).forEach(this.addLocalTracks.bind(this))
  }

  addLocalTracks(peerId) {
    this.localStream.getTracks().forEach((track) => {
      this.peers[peerId].addTrack(track, this.localStream)
    })
  }
}

export default HalloClient