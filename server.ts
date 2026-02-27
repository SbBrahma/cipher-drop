import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = Number(process.env.PORT) || 3000;

  const activeRooms = new Set<string>();

  // Signaling logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("create-room", (rawRoomId) => {
      const roomId = String(rawRoomId).trim();
      socket.join(roomId);
      activeRooms.add(roomId);
      socket.emit("room-created", roomId);
      console.log(`User ${socket.id} created room ${roomId}`);
    });

    socket.on("join-room", (rawRoomId) => {
      const roomId = String(rawRoomId).trim();
      
      if (!activeRooms.has(roomId)) {
        socket.emit("error", "Room does not exist. Please check the code.");
        return;
      }

      const room = io.sockets.adapter.rooms.get(roomId);
      if (room && room.size >= 2) {
        socket.emit("error", "This room is already full (max 2 users).");
        return;
      }

      socket.join(roomId);
      socket.emit("room-joined", roomId);
      socket.to(roomId).emit("user-joined", socket.id);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on("offer", ({ roomId, offer }) => {
      socket.to(roomId).emit("offer", offer);
    });

    socket.on("answer", ({ roomId, answer }) => {
      socket.to(roomId).emit("answer", answer);
    });

    socket.on("ice-candidate", ({ roomId, candidate }) => {
      socket.to(roomId).emit("ice-candidate", candidate);
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          const roomObj = io.sockets.adapter.rooms.get(room);
          if (roomObj && roomObj.size <= 1) {
            activeRooms.delete(room);
          }
          socket.to(room).emit("user-left", socket.id);
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
