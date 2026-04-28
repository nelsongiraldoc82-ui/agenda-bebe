# Agenda del Bebé 🍼

Aplicación PWA para el seguimiento diario de tu bebé: alimentación, pañales, sueño y crecimiento.

## 🚀 Despliegue en Vercel

### Opción 1: Desde GitHub (Recomendado)

1. **Sube este repositorio a GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/agenda-bebe.git
   git push -u origin main
   ```

2. **Conecta con Vercel**
   - Ve a [vercel.com](https://vercel.com)
   - Haz clic en "Add New Project"
   - Importa tu repositorio de GitHub
   - Vercel detectará automáticamente la configuración
   - Haz clic en "Deploy"

### Opción 2: Arrastrar y soltar

1. Ve a [vercel.com](https://vercel.com)
2. Arrastra la carpeta del proyecto directamente al dashboard

## 📱 Funcionalidades

- **Alimentación**: Registro de pecho, leche mixta y extracciones
- **Pañales**: Control de pipi y caca con peso opcional
- **Sueño**: Timer para registrar siestas y noche
- **Crecimiento**: Seguimiento de peso y talla
- **Resumen**: Estadísticas diarias, semanales y mensuales

## 🔧 Tecnologías

- HTML5 + CSS3 + JavaScript vanilla
- Firebase (Auth + Firestore)
- PWA (Service Worker + Manifest)
- Vercel (Hosting)

## 📲 Instalación PWA

La aplicación se puede instalar como app nativa en tu dispositivo:
1. Abre la app en tu navegador
2. En el menú del navegador selecciona "Añadir a pantalla de inicio"

## 🔐 Autenticación

- Registro con email/contraseña
- Login seguro
- Recuperación de contraseña
- Datos privados por usuario

## 📄 Licencia

MIT
