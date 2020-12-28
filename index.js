import io from "socket.io-client";

class HalloClient {
  constructor(iceServers) {
    this.peers = {}
    this.iceServers = iceServers
  }

  join(username, room, mediaLambda, callbacks) {
    if (!room) throw new Error("Invalid room")

    this.socket = io()
    this.username = username
    this.room = room
    this.mediaLambda = mediaLambda
    this.changeCallbacks(callbacks)
    this.prepareSocket()
    this.socket.emit('hallo_join', username, room)
  }

  leave() {
    this.socket.emit('hallo_left')
  }

  changeCallbacks(callbacks) {
    this.callbacks = callbacks
  }

  async changeMediaLambda(mediaLambda) {
    this.mediaLambda = mediaLambda
    await this.loadStream()
    this.setLocalTracksForAll()
  }

  prepareSocket() {
    this.socket.on('hallo_created', async () => {
      await this.loadStream()
    })

    this.socket.on('hallo_joined', async () => {
      await this.loadStream()
      this.socket.emit('hallo_new_peer')
    })

    this.socket.on('hallo_already_joined', (data) => {
      this.callbacks.alreadyJoined(data)
      this.socket.close()
    })

    this.socket.on('hallo_left', ({id}) => {
      this.peers[id].close()
      delete this.peers[id]
    })

    this.socket.on('hallo_new_peer', ({id, username}) => {
      this.newPeer(id, username)
    })

    this.socket.on('hallo_offer', async ({id, username}, {sdp}) => {
      if(!this.peers[id]) {
        this.newPeer(id, username)
      }
      this.addRemote(id, sdp)
      await this.createAnswer(id)
    })

    this.socket.on('hallo_answer', ({id}, {sdp}) => {
      this.addRemote(id, sdp)
    })

    this.socket.on('hallo_candidate', ({id}, {candidate}) => {
      this.peers[id].addIceCandidate(new RTCIceCandidate(candidate))
    })
  }

  async loadStream() {
    try {
      const stream = await this.mediaLambda()
      if(this.localStream) {
        this.localStream.getTracks().forEach(track => {
          track.enabled = false
          track.stop()
          this.callbacks.removeLocalTrack(this.username, track)
        })
      }
      this.localStream = stream
      this.localStream.getTracks().forEach(track => this.callbacks.addLocalTrack(this.username, track))
    } catch (error) {
      console.error('Could not get user media', error)
    }
  }

  newPeer(peerId, username) {
    const peer = new RTCPeerConnection(this.iceServers)
    this.peers[peerId] = peer
    this.peers[peerId].username = username
    this.peers[peerId].stream = new MediaStream([])

    this.setLocalTracks(peerId)

    peer.ontrack = ({transceiver}) => this.addRemoteTrack(peerId, transceiver.receiver.track)
    peer.onicecandidate = (e) => this.sendIceCandidate(e, peerId)
    peer.onnegotiationneeded = () => this.createOffer(peerId)
  }

  addRemote(peerId, event) {
    this.peers[peerId].setRemoteDescription(new RTCSessionDescription(event))
  }

  async createOffer(peerId) {
    const sdp = await this.peers[peerId].createOffer()
    this.peers[peerId].setLocalDescription(sdp)

    this.socket.emit('hallo_offer', {sdp, peerId})
  }

  async createAnswer(peerId) {
    const sdp = await this.peers[peerId].createAnswer()
    this.peers[peerId].setLocalDescription(sdp)

    this.socket.emit('hallo_answer', {sdp, peerId})
  }

  sendIceCandidate(event, peerId) {
    if (event.candidate) {
      this.socket.emit('hallo_candidate', {candidate: event.candidate, peerId})
    }
  }

  addRemoteTrack(peerId, track) {
    track.onmute = () => {
      this.peers[peerId].stream.removeTrack(track)
      this.callbacks.removeRemoteTrack(this.peers[peerId].username, track)
    }
    track.onunmute = () => {
      this.peers[peerId].stream.addTrack(track)
      this.callbacks.addRemoteTrack(this.peers[peerId].username, track)
    }
  }

  setLocalTracksForAll() {
    Object.keys(this.peers).forEach(this.setLocalTracks.bind(this))
  }

  setLocalTracks(peerId) {
    this.outputTransceivers(peerId).forEach(transceiver => {
      const track = this.localStream.getTracks().find(it => it.kind === transceiver.sender.track.kind)
      if(!track) {
        transceiver.sender.replaceTrack(null)
        transceiver.direction = 'inactive'
      }
    })

    this.localStream.getTracks().forEach((track) => {
      const transceiver = this.outputTransceivers(peerId).find(it => it.sender.track.kind === track.kind)
      if (transceiver) {
        transceiver.sender.replaceTrack(track)
        return
      }

      const inactiveTransceiver = this.firstInactiveTransceiver(peerId)
      if(inactiveTransceiver) {
        inactiveTransceiver.sender.replaceTrack(track)
        inactiveTransceiver.direction = 'sendrecv'
        return
      }

      this.peers[peerId].addTransceiver(track)
    })
  }

  outputTransceivers(peerId) {
    return this.peers[peerId]
      .getTransceivers()
      .filter(it => it.currentDirection === 'sendonly')
      .filter(it => it.sender.track)
  }

  firstInactiveTransceiver(peerId) {
    return this.peers[peerId]
      .getTransceivers()
      .filter(it => it.direction === 'inactive')
      .find(it => !it.sender.track)
  }
}

export default HalloClient