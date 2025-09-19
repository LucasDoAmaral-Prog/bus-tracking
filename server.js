const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Função distância (Haversine)
function calculateDistance(p1, p2) {
  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(p2.latitude - p1.latitude);
  const dLon = toRad(p2.longitude - p1.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.latitude)) * Math.cos(toRad(p2.latitude)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const baseDistance = R * c;
  
  // Aplica fator de correção para aproximar distância real de estrada
  const correctionFactor = 1.25; // ajuste conforme testes locais
  const correctedDistance = baseDistance * correctionFactor;

  return Math.round(correctedDistance * 100) / 100; // arredondado para duas casas decimais
}


function getDistanceAndTime(bus, direction) {
  // direction pode ser "toRodeio" ou "toFCA"
  if (!bus.currentPosition) return { distance: null, time: 'Indefinido' };

  let distance = null;
  if(direction === 'toRodeio') {
    distance = calculateDistance(bus.currentPosition, bus.finalPoint);
  } else if(direction === 'toFCA') {
    distance = calculateDistance(bus.currentPosition, bus.initialPoint);
  }
  const speed = bus.speed || 0;
  const time = speed > 0 ? tempoEstimado(distance, speed) : 'Indefinido';

  return { distance, time };
}

// Dados dos ônibus em memória
const buses = new Map([
  ['bus-001', {
    id: 'bus-001',
    name: 'Linha FCA ↔ Rodeio 001',
    route: 'FCA UNICAMP → Espaço Rodeio → FCA UNICAMP',
    initialPoint: { latitude: -22.5565835, longitude: -47.4216307 },
    //-22.619852, -47.377685
    finalPoint: { latitude: -22.619852, longitude: -47.377685 },
    currentPosition: null,
    speed: 0,
    lastUpdate: null,
  }],
  ['bus-002', {
    id: 'bus-002',
    name: 'Linha FCA ↔ Rodeio 002',
    route: 'FCA UNICAMP → Espaço Rodeio → FCA UNICAMP',
    initialPoint: { latitude: -22.5565835, longitude: -47.4216307 },
    finalPoint: { latitude: -22.619852, longitude: -47.377685 },
    currentPosition: null,
    speed: 0,
    lastUpdate: null,
  }],
]);

// Listar todos ônibus
app.get('/api/buses', (req, res) => {
  const result = Array.from(buses.values()).map(bus => {
    const obj = { ...bus };
    if (bus.currentPosition) {
      obj.distanceToInitial = calculateDistance(bus.currentPosition, bus.initialPoint);
      obj.distanceToFinal = calculateDistance(bus.currentPosition, bus.finalPoint);
    }
    return obj;
  });
  res.json({ success: true, data: result });
});

// Atualizar localização
app.post('/api/tracking/:busId/location', (req, res) => {
  const { busId } = req.params;
  let { latitude, longitude, speed } = req.body;
  latitude = parseFloat(latitude);
  longitude = parseFloat(longitude);
  speed = parseFloat(speed);

  const bus = buses.get(busId);
  if (!bus) return res.status(404).json({ success: false, message: 'Ônibus não encontrado' });

  if (isNaN(latitude) || isNaN(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180) {
    return res.status(400).json({ success: false, message: 'Coordenadas inválidas' });
  }

  bus.currentPosition = { latitude, longitude };
  bus.speed = speed || 0;
  bus.lastUpdate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const distanceToInitial = calculateDistance(bus.currentPosition, bus.initialPoint);
  const distanceToFinal = calculateDistance(bus.currentPosition, bus.finalPoint);

  const responseData = {
    busId: bus.id,
    currentPosition: bus.currentPosition,
    speed: bus.speed,
    distanceToInitial,
    distanceToFinal,
    lastUpdate: bus.lastUpdate
  };

  io.emit('bus-position-update', responseData);
  res.json({ success: true, message: 'Localização atualizada', data: responseData });
});

// API de todas as posições
app.get('/api/tracking/all', (req, res) => {
  const result = Array.from(buses.values()).map(bus => {
    const obj = { ...bus };
    if (bus.currentPosition) {
      obj.distanceToInitial = calculateDistance(bus.currentPosition, bus.initialPoint);
      obj.distanceToFinal = calculateDistance(bus.currentPosition, bus.finalPoint);
    }
    return obj;
  });
  res.json({ success: true, data: result });
});

// Socket.IO para atualização em tempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.on('bus-location-update', (data) => {
    const { busId, latitude, longitude, speed } = data;
    const bus = buses.get(busId);
    if (bus) {
      bus.currentPosition = { latitude, longitude };
      bus.speed = speed;
      bus.lastUpdate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      io.emit('bus-position-update', { busId, latitude, longitude, speed, lastUpdate: bus.lastUpdate });
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse http://localhost:${PORT}`);
});
