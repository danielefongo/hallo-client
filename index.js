import io from "socket.io-client";
import EventEmitter from "events";

class HalloClient extends EventEmitter {
  constructor(iceServers) {
    super()
    this.peers = {}
    this.iceServers = iceServers
  }

  join(username, room, mediaLambda) {
    if (!room) throw new Error("Invalid room")

    this.socket = io()
    this.username = username
    this.room = room
    this.mediaLambda = mediaLambda
    this.prepareSocket()
    this.socket.emit('hallo_join', username, room)
  }

  send(username, message) {
    const peer = Object.values(this.peers).find(it => it.username === username)
    peer && peer.channel.send(JSON.stringify(message))
  }

  leave() {
    this.socket.emit('hallo_left')
    this.emit('left', this.description)
  }

  async changeMediaLambda(mediaLambda) {
    this.mediaLambda = mediaLambda
    await this.loadStream()
    this.setLocalTracksForAll()
  }

  prepareSocket() {
    this.socket.on('hallo_created', async (data) => {
      await this.loadStream()
      this.description = data
      this.emit('joined', data)
    })

    this.socket.on('hallo_joined', async (data) => {
      await this.loadStream()
      this.description = data
      this.emit('joined', data)
      this.socket.emit('hallo_new_peer')
    })

    this.socket.on('hallo_already_joined', (data) => {
      this.emit('already_joined', data)
    })

    this.socket.on('hallo_left', (data) => {
      this.emit('left', data)

      const {id} = data
      this.peers[id].channel.close()
      this.peers[id].close()
      delete this.peers[id]
    })

    this.socket.on('hallo_new_peer', (data) => {
      this.emit('joined', data)

      const {id, username} = data
      this.newPeer(id, username)
    })

    this.socket.on('hallo_offer', async ({id, username}, {sdp}) => {
      if(!this.peers[id]) {
        this.newPeer(id, username)
      }
      this.addRemote(this.peers[id], sdp)
      await this.createAnswer(this.peers[id])
    })

    this.socket.on('hallo_answer', ({id}, {sdp}) => {
      this.addRemote(this.peers[id], sdp)
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
          this.emit('remove_local_track', {username: this.username, track})
        })
      }
      this.localStream = stream
      this.localStream.getTracks().forEach(track => this.emit('add_local_track', {username: this.username, track}))
    } catch (error) {
      console.error('Could not get user media', error)
    }
  }

  newPeer(peerId, username) {
    const peer = new RTCPeerConnection(this.iceServers)
    peer.id = peerId
    peer.username = username
    peer.stream = new MediaStream([])
    peer.channel = peer.createDataChannel("default")

    this.peers[peerId] = peer

    this.setLocalTracks(peer)

    peer.ondatachannel = ({channel}) => this.createDataChannel(channel)
    peer.ontrack = ({transceiver}) => this.addRemoteTrack(peer, transceiver.receiver.track)
    peer.onicecandidate = (e) => this.sendIceCandidate(e, peer)
    peer.onnegotiationneeded = () => this.createOffer(peer)
  }

  createDataChannel(channel) {
    const hallo = this
    channel.onmessage = ({data}) => hallo.emit('message', JSON.parse(data))
    channel.onclosing = () => channel.close()
  }

  addRemote(peer, event) {
    peer.setRemoteDescription(new RTCSessionDescription(event))
  }

  async createOffer(peer) {
    const sdp = await peer.createOffer()
    peer.setLocalDescription(sdp)

    this.socket.emit('hallo_offer', {sdp, peerId: peer.id})
  }

  async createAnswer(peer) {
    const sdp = await peer.createAnswer()
    peer.setLocalDescription(sdp)

    this.socket.emit('hallo_answer', {sdp, peerId: peer.id})
  }

  sendIceCandidate(event, peer) {
    if (event.candidate) {
      this.socket.emit('hallo_candidate', {candidate: event.candidate, peerId: peer.id})
    }
  }

  addRemoteTrack(peer, track) {
    track.onmute = () => {
      peer.stream.removeTrack(track)
      this.emit('remove_remote_track', {username: peer.username, track})
    }
    track.onunmute = () => {
      peer.stream.addTrack(track)
      this.emit('add_remote_track', {username: peer.username, track})
    }
  }

  setLocalTracksForAll() {
    Object.values(this.peers).forEach(this.setLocalTracks.bind(this))
  }

  setLocalTracks(peer) {
    this.outputTransceivers(peer).forEach(transceiver => {
      const track = this.localStream.getTracks().find(it => it.kind === transceiver.sender.track.kind)
      if(!track) {
        transceiver.sender.replaceTrack(null)
        transceiver.direction = 'inactive'
      }
    })

    this.localStream.getTracks().forEach((track) => {
      const transceiver = this.outputTransceivers(peer).find(it => it.sender.track.kind === track.kind)
      if (transceiver) {
        transceiver.sender.replaceTrack(track)
        return
      }

      const inactiveTransceiver = this.firstInactiveTransceiver(peer)
      if(inactiveTransceiver) {
        inactiveTransceiver.sender.replaceTrack(track)
        inactiveTransceiver.direction = 'sendrecv'
        return
      }

      peer.addTransceiver(track)
    })
  }

  outputTransceivers(peer) {
    return peer
      .getTransceivers()
      .filter(it => it.currentDirection === 'sendonly')
      .filter(it => it.sender.track)
  }

  firstInactiveTransceiver(peer) {
    return peer
      .getTransceivers()
      .filter(it => it.direction === 'inactive')
      .find(it => !it.sender.track)
  }
}

export default HalloClient