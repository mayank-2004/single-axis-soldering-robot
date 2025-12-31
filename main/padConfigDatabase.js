import sqlite3 from 'sqlite3'
import path from 'path'
import { app } from 'electron'

class PadConfigDatabase {
  constructor() {
    this.db = null
    this.init()
  }

  init() {
    const dbPath = path.join(process.cwd(), 'pad-configurations.db')
    console.log("Database path:", dbPath)
    const sqlite = sqlite3.verbose()
    this.db = new sqlite.Database(dbPath)
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS pad_configurations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        shape TEXT NOT NULL,
        dimensions TEXT NOT NULL,
        solderHeight REAL,
        area REAL,
        volume REAL,
        wireUsed REAL,
        stepsMoved INTEGER,
        category TEXT,
        compensatedDuration INTEGER,
        createdAt TEXT NOT NULL
      )
    `)
  }

  save(config) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO pad_configurations 
        (id, name, shape, dimensions, solderHeight, area, volume, wireUsed, stepsMoved, category, compensatedDuration, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      
      stmt.run([
        config.id,
        config.name,
        config.shape,
        JSON.stringify(config.dimensions),
        config.solderHeight,
        config.area,
        config.volume,
        config.wireUsed,
        config.stepsMoved,
        config.category,
        config.compensatedDuration,
        config.createdAt
      ], function(err) {
        if (err) {
          reject(err)
        } else {
          resolve(this.lastID)
        }
      })
      
      stmt.finalize()
    })
  }

  loadAll() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM pad_configurations ORDER BY createdAt DESC', (err, rows) => {
        if (err) {
          reject(err)
        } else {
          const configs = rows.map(row => ({
            ...row,
            dimensions: JSON.parse(row.dimensions)
          }))
          resolve(configs)
        }
      })
    })
  }

  close() {
    if (this.db) {
      this.db.close()
    }
  }
}

export default PadConfigDatabase