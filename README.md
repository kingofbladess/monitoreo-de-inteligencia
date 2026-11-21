# Monitoreo de Inteligencia — Acceso Seguro y Centro de Control

Aplicación web completa compuesta por una pantalla de acceso split-screen con animación 3D interactiva y un **Centro de Monitoreo** en tiempo real.

## Módulos incluidos

1. **Acceso Seguro (`index.html` / `acceso_seguro_monitoreo_inteligente.html`):**
   - Panel izquierdo con esfera geodésica 3D, núcleo interno contrarrotatorio, 4 anillos orbitales con satélites, rotación con arrastre e inercia, rayos magnéticos al cursor, onda expansiva al clic y zoom suave.
   - Verificación 2FA / OTP en modo demo, bloqueo tras 3 intentos fallidos y **destello solar dorado** al ingresar con acceso directo al Centro de Monitoreo.

2. **Centro de Monitoreo (`monitor.html`, `monitor.css`, `monitor.js`):**
   - **Resumen general:** KPIs en vivo, mapa táctico interactivo de nodos con escaneo de red, gráfica de telemetría en tiempo real, alertas recientes y salud de infraestructura.
   - **Cámaras y Sensores:** 6 feeds en vivo (Óptico, Térmico y LIDAR) con filtros y vista ampliada en modal.
   - **Red de Nodos:** Tabla interactiva con búsqueda, filtros y acciones rápidas (`Ping`, `Aislar`/`Reactivar`, `Reiniciar`).
   - **Centro de Alertas:** Simulación de alertas, reconocimiento, resolución individual o masiva y exportación de reporte JSON.
   - **Configuración:** Selector de tema (`Esmeralda`, `Dorado Solar`, `Cian Táctico`), frecuencia de telemetría y escaneo automático.

## Demo en vivo

- **Acceso Seguro:** https://kingofbladess.github.io/monitoreo-de-inteligencia/
- **Credenciales demo:** `admin` / `Monitor2026!` (código OTP visible en pantalla con botón **Autocompletar**).
