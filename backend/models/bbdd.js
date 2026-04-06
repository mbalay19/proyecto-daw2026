import mariadb from 'mariadb'
import bcrypt from 'bcrypt'
import dotenv from 'dotenv'

dotenv.config()

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10
})

/*
Inicializar la base de datos creando las tablas para usuarios y moods.

*/
export async function initializeDatabase () {
  let conn
  try {
    conn = await pool.getConnection()

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        lastName VARCHAR(100) NOT NULL,
        telephone VARCHAR(20),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        provider VARCHAR(50) DEFAULT 'local',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS moods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        mood INT NOT NULL CHECK (mood >= 0 AND mood <= 10),
        notes TEXT,
        date DATE NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255),
        icon VARCHAR(50),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS habit_options (
        id INT AUTO_INCREMENT PRIMARY KEY,
        habitId INT NOT NULL,
        label VARCHAR(100) NOT NULL,
        sortOrder INT DEFAULT 0,
        FOREIGN KEY (habitId) REFERENCES habits(id) ON DELETE CASCADE
      )
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS habit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        habitId INT NOT NULL,
        habitOptionId INT NOT NULL,
        date DATE NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_habit_date (userId, habitId, date),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (habitId) REFERENCES habits(id) ON DELETE CASCADE,
        FOREIGN KEY (habitOptionId) REFERENCES habit_options(id) ON DELETE CASCADE
      )
    `)

    await seedHabits(conn)

    console.log('Base de datos inicializada correctamente')
  } catch (error) {
    console.error('Error inicializando la base de datos:', error)
    throw error
  } finally {
    if (conn) conn.release()
  }
}

async function seedHabits (conn) {
  const [{ count }] = await conn.query('SELECT COUNT(*) AS count FROM habits')
  if (Number(count) > 0) return

  const habitsData = [
    {
      name: 'Sueño',
      description: 'Horas de sueño',
      icon: 'moon',
      options: ['Menos de 5h', '5-6h', '6-7h', '7-8h', 'Más de 8h']
    },
    {
      name: 'Deporte',
      description: 'Actividad física',
      icon: 'dumbbell',
      options: ['No hice', '15-30min', '30-60min', 'Más de 1h']
    },
    {
      name: 'Lectura',
      description: 'Tiempo de lectura',
      icon: 'book',
      options: ['No leí', '15-30min', '30-60min', 'Más de 1h']
    },
    {
      name: 'Estudio',
      description: 'Tiempo de estudio',
      icon: 'pencil',
      options: ['No estudié', '30min-1h', '1-2h', 'Más de 2h']
    },
    {
      name: 'Alimentación',
      description: 'Calidad de la dieta',
      icon: 'apple',
      options: ['Muy mala', 'Mala', 'Regular', 'Buena', 'Muy buena']
    }
  ]

  for (const habit of habitsData) {
    const result = await conn.query(
      'INSERT INTO habits (name, description, icon) VALUES (?, ?, ?)',
      [habit.name, habit.description, habit.icon]
    )
    const habitId = result.insertId

    for (let i = 0; i < habit.options.length; i++) {
      await conn.query(
        'INSERT INTO habit_options (habitId, label, sortOrder) VALUES (?, ?, ?)',
        [habitId, habit.options[i], i]
      )
    }
  }
}

// Exportamos la classe del modelo del Usuario userModel para poder usarla en otros archivos

export class UserModel {
  // Metodo para crear un nuevo usuario en la base de datos, recibe un objeto con los datos del usuario y devuelve el usuario creado sin la contraseña
  static async create ({ name, lastName, telephone, email, password }) {
    let conn
    try {
      conn = await pool.getConnection()
      const hashedPassword = await bcrypt.hash(password, 10)

      const resultado = await conn.query(
        'INSERT INTO users (name, lastName, telephone, email, password) VALUES (?, ?, ?, ?, ?)',
        [name, lastName, telephone, email, hashedPassword]
      )
      const user = await conn.query(
        'SELECT id, name, lastName, telephone, email FROM users where id = ?',
        [resultado.insert.Id]
      )

      return user[0]
    } finally {
      // Liberar la conexión a la bbdd después de usarla para evitar memory leaks y problemas de conexión
      if (conn) conn.release()
    }
  }

  static async findByEmail (email) {
    let conn
    try {
      conn = await pool.getConnection()
      const users = await conn.query('SELECT * FROM users WHERE email = ?', [email])
      return users[0] || null // Devolver el primer usuario encontrado o null si no existe
    } finally {
      if (conn) conn.release()
    }
  }

  static async findById (id) {
    let connection
    try {
      connection = await pool.getConnection()
      const users = await connection.query('SELECT id, name, lastName, telephone, email FROM users WHERE id = ?', [id])
      return users[0] || null // Igual que el metodo anterior
    } finally {
      if (connection) connection.release()
    }
  }

  static async getAllUsers () {
    let connection
    try {
      connection = await pool.getConnection()
      return await connection.query('SELECT id, name, lastName, telephone, email FROM users')
    } finally {
      if (connection) connection.release()
    }
  }

  static async verifyPassword (plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword)
    // Compara la contraseña sin cifrar con la cifrada y devuelve booleano True si coinciden o False si no
  }
}

// <---- MoodModel---->

export class MoodModel {
  static async create ({ userId, mood, notes, date }) {
    let connection
    try {
      connection = await pool.getConnection()

      const moodValue = Number(mood)
      if (isNaN(moodValue) || moodValue < 0 || moodValue > 10) {
        throw new Error('El valor del mood debe ser un número del 1 al 10')
      }

      const moodDate = date ? new Date(date) : new Date()
      const formattedDate = moodDate.toISOString().split('T')[0] // Formatear la fecha a DD-MM-YYYY

      const result = await connection.query(
        'INSERT INTO moods (userId, mood, notes, date) VALUES (?, ?, ?, ?)',
        [userId, moodValue, notes, formattedDate]
      )

      const newMood = await connection.query('SELECT * FROM moods WHERE id = ?', [result.insertId])
      return newMood[0]
    } finally {
      if (connection) connection.release()
    }
  }
}
