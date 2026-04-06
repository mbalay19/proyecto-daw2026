import express, { json } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import moodRouter from './backend/routes/moods.js'
import { habitRouter } from './backend/routes/habits.js'

dotenv.config()

const app = express()

// Meter el cookieparser y middleware antes de las rutas

app.use(cookieParser())
app.use(cors({
  origin: 'http://localhost:4444',
  credentials: true
}))

app.use(express.static('frontend'))
app.use(express.urlencoded({ extended: true }))
app.use(json())
app.disable('x-powered-by') // Deshabilitar el header "X-Powered-By" para mejorar la seguridad

// Configuración de seguridad adicional para XSS, Xframe, etc.
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY') // Evitar que la página sea cargada en un iframe
  res.setHeader('X-XSS-Protection', '1; mode=block') // Habilitar la protección contra XSS en navegadores compatibles
  res.setHeader('X-Content-Type-Options', 'nosniff') // Evitar que el navegador interprete archivos como un tipo diferente al declarado
  next()
})

app.use('/', moodRouter)
app.use('/', habitRouter)

const PUERTO = process.env.PORT ?? 2345

app.listen(PUERTO, () => {
  console.log(`Servidor escuchando en el puerto ${PUERTO}`)
})
