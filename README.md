# Monitoreo de Inteligencia — Acceso Seguro

Interfaz de inicio de sesión moderna en diseño dividido (*split-screen*) con visualización 3D interactiva a la izquierda y autenticación con verificación en dos pasos (2FA / OTP) a la derecha.

## Características principales

- **Animación 3D interactiva (Canvas 2D):**
  - Esfera geodésica exterior + núcleo interno contrarrotatorio + 4 anillos orbitales segmentados con satélites y estelas.
  - Arrastrar para rotar con inercia, rayos magnéticos al mover el cursor, onda expansiva y ráfaga de paquetes al hacer clic, y zoom suave con rueda o doble clic.
  - Pausa automática cuando la pestaña o el área no están visibles (`visibilitychange` + `IntersectionObserver`) y soporte para `prefers-reduced-motion`.
- **Efecto de destello solar dorado al ingresar:**
  - Resplandor radial, 18 rayos de sol rotatorios, destello anamórfico horizontal, 3 ondas doradas concéntricas, 64 chispas solares y barrido dorado sobre la tarjeta de acceso.
- **Login minimalista y accesible:**
  - Validación inline (`aria-invalid` / `aria-describedby`), detección de Bloq Mayús, modal accesible con cierre por `Escape` y trampa de foco, verificación 2FA OTP y bloqueo temporal tras 3 intentos fallidos.

## Uso local

Abre `index.html` o `acceso_seguro_monitoreo_inteligente.html` directamente en cualquier navegador moderno (no requiere servidor ni instalación de dependencias).

### Credenciales de demostración

- **Usuario:** `admin` | **Contraseña:** `Monitor2026!`
- **Usuario alterno:** `operador` | **Contraseña:** `Seguro2026!`
- El código OTP de 6 dígitos en modo demo se muestra en pantalla junto al botón **Autocompletar**.
