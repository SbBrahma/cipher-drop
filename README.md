# CipherDrop – Encrypted Peer-to-Peer File Transfer

CipherDrop is a secure, high-speed, peer-to-peer file sharing application that works directly in your browser. It uses WebRTC technology to establish a direct connection between two devices, ensuring that your files are never stored on any server.

> **"Drop Files. Leave No Trace."**

## 🚀 Features

- **Direct P2P Transfer:** Files go directly from browser to browser using WebRTC DataChannels.
- **No Server Storage:** Your data stays private. The server only helps with the initial handshake (signaling).
- **Multi-File Support:** Select and transfer multiple files simultaneously with a managed queue.
- **6-Digit Room Codes:** Simple and secure room creation for instant pairing.
- **QR Code Support:** Easily join rooms by scanning a QR code with your device's camera.
- **Real-time Progress:** Live tracking of transfer speed, progress percentage, and status for every file.
- **Modern UI:** Clean, responsive glassmorphic design with smooth animations and dark/light mode support.
- **Cross-Platform:** Works on any device with a modern web browser (Chrome, Firefox, Safari, Edge).

## 🛠️ Tech Stack

- **Frontend:** React 19, Tailwind CSS 4, Lucide Icons, Framer Motion.
- **Backend:** Node.js, Express (Signaling Server).
- **Real-time:** Socket.io for signaling.
- **P2P Engine:** WebRTC (RTCPeerConnection & RTCDataChannel).

## 📖 How It Works

1. **Signaling:** When you create or join a room, the app connects to a signaling server via WebSockets (Socket.io).
2. **Handshake:** The two peers exchange "Offer" and "Answer" messages along with "ICE Candidates" (network paths) through the signaling server.
3. **P2P Connection:** Once the handshake is complete, a direct WebRTC DataChannel is established between the browsers.
4. **File Transfer:** Files are broken into small chunks (64KB), sent over the DataChannel, and reassembled on the receiver's end.
5. **Download:** Once all chunks are received, a Blob is created and the file is automatically downloaded to the user's device.

## 💻 Installation & Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Steps
1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/cipher-drop.git
   cd cipher-drop
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   Navigate to `http://localhost:3000`.

## 🌐 Deployment

### Deploying on Render / Railway / Fly.io
1. Connect your GitHub repository to your chosen hosting provider.
2. Set the **Build Command** to `npm run build`.
3. Set the **Start Command** to `npm start`.
4. Ensure the `NODE_ENV` environment variable is set to `production`.
5. The application will automatically serve the static frontend and handle signaling via the Express server.

## 🔒 Security

- **End-to-End Privacy:** Data is encrypted by WebRTC during transit using DTLS (Datagram Transport Layer Security).
- **No Logs:** The signaling server only facilitates the connection and does not log file metadata or content.
- **Temporary Rooms:** Rooms are ephemeral and destroyed as soon as peers disconnect.
- **Direct Connection:** By bypassing servers for the actual data transfer, you eliminate the "man-in-the-middle" risk associated with cloud storage.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
