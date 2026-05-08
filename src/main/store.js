// src/main/store.js
// Lightweight JSON-based persistent storage using Electron's userData path

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Store {
  constructor() {
    this.dataDir = app.getPath('userData');
    this.clustersFile = path.join(this.dataDir, 'clusters.json');
    this.historyFile = path.join(this.dataDir, 'history.json');
    this._ensureFiles();
  }

  _ensureFiles() {
    if (!fs.existsSync(this.clustersFile)) {
      fs.writeFileSync(this.clustersFile, JSON.stringify([]));
    }
    if (!fs.existsSync(this.historyFile)) {
      fs.writeFileSync(this.historyFile, JSON.stringify([]));
    }
  }

  _read(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  }

  _write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  // Clusters
  getClusters() {
    return this._read(this.clustersFile);
  }

  addCluster(cluster) {
    const clusters = this.getClusters();
    const newCluster = {
      ...cluster,
      id: uuidv4(),
      createdAt: Date.now(),
      lastUsedAt: null,
    };
    clusters.push(newCluster);
    this._write(this.clustersFile, clusters);
    return newCluster;
  }

  updateCluster(updated) {
    const clusters = this.getClusters();
    const idx = clusters.findIndex(c => c.id === updated.id);
    if (idx !== -1) {
      clusters[idx] = { ...clusters[idx], ...updated };
      this._write(this.clustersFile, clusters);
      return clusters[idx];
    }
    return null;
  }

  touchCluster(id) {
    const clusters = this.getClusters();
    const idx = clusters.findIndex(c => c.id === id);
    if (idx !== -1) {
      clusters[idx].lastUsedAt = Date.now();
      this._write(this.clustersFile, clusters);
    }
  }

  deleteCluster(id) {
    const clusters = this.getClusters().filter(c => c.id !== id);
    this._write(this.clustersFile, clusters);
    // Also remove history for this cluster
    this.clearHistory(id);
    return true;
  }

  // History
  getHistory(clusterId) {
    const all = this._read(this.historyFile);
    return clusterId ? all.filter(h => h.clusterId === clusterId) : all;
  }

  addHistory(item) {
    const history = this._read(this.historyFile);
    const newItem = { ...item, id: uuidv4(), executedAt: Date.now() };
    history.unshift(newItem);
    // Keep max 200 entries total
    const trimmed = history.slice(0, 200);
    this._write(this.historyFile, trimmed);
    return newItem;
  }

  clearHistory(clusterId) {
    const history = this._read(this.historyFile).filter(h => h.clusterId !== clusterId);
    this._write(this.historyFile, history);
    return true;
  }
}

module.exports = { Store };
