# Changelog

## 0.5.2

- README screenshot now uses an absolute public URL, so it shows in the extension details and on the Marketplace.
- Added repository, homepage, and issue tracker metadata.
- Added GitHub Actions Trusted Publishing workflow, so the Marketplace release does not need an Azure DevOps PAT.
- The canvas now takes keyboard focus when clicked, so editor shortcuts work after drawing.
- Added VS Code keybindings for copy, cut, paste, select all, and deselect, preserving native text-field editing.
- Shift now adds to the selection and Alt subtracts from it, including the magic wand.
- Selection tools no longer move the selected pixels; use the Move tool (V) to drag them.
- The development workspace opens PNG files with the pixel editor.

## 0.5.1

- Corregido el nombre duplicado en el selector de editores: el editor personalizado se llama **Pixel Art Editor** y la extensión **Pixel Art & Spritesheet Editor**.

## 0.5.0

- La extensión pasa a llamarse **Pixel Art & Spritesheet Editor**.
- Eliminados los `activationEvents` redundantes; VS Code los genera desde las contribuciones.
- Añadido el script `npm run publish` para publicar en el Marketplace.

## 0.4.0

- Shift + lápiz/borrador dibuja una línea recta.
- Shift + línea fija horizontal, vertical o diagonal de 45°.
- Shift + rectángulo/elipse mantiene proporciones (cuadrado/círculo).
- Alt + línea/rectángulo/elipse dibuja desde el centro.
- Nuevas selecciones rectangulares y elípticas con Shift (cuadrado/círculo) y Alt (desde el centro).
- Nueva herramienta de selección elíptica.

## 0.3.0

- Nueva herramienta Varita mágica: selecciona el área contigua del mismo color exacto.
- Selecciones por máscara, con contorno sobre la forma real seleccionada.
- Las herramientas de dibujo, borrado y relleno solo modifican píxeles dentro de la selección.
- Las selecciones por máscara se pueden mover, copiar, cortar, pegar y borrar.

## 0.2.0

- Interfaz bilingüe español/inglés.
- Selector de idioma en la barra superior y ajuste `pixelArt.language` (`auto`, `en`, `es`).
- En modo automático se usa español si VS Code está en español; cualquier otro idioma usa inglés.
- Atajos Ctrl+Z, Ctrl+Y y Ctrl+Shift+Z funcionando dentro del editor.
- Textos de comandos, diálogos del host y mensajes de error localizados.

## 0.1.0

- Editor de pixel art para archivos PNG dentro de VS Code.
- Herramientas de lápiz, borrador, cuentagotas, relleno, línea, rectángulo, elipse, selección, mover y mano.
- Tamaño y forma del pincel, opacidad, relleno de figuras y tolerancia de relleno.
- Paleta, colores recientes y colores personalizados.
- Selección con copiar, cortar, pegar, mover y borrar.
- Historial de deshacer y rehacer, zoom, cuadrícula y redimensionado de imagen.
- Modo spritesheet con previsualización de animación, rango de fotogramas, FPS y bucle.
