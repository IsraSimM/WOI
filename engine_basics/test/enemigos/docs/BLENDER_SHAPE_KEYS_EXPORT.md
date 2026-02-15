# Guía de Exportación de Shape Keys desde Blender 🎨

## 🔍 Diagnóstico del Problema

Si las shape keys no se cargan, puede ser por:
1. ❌ Las shape keys no se exportaron en el archivo GLTF
2. ❌ La configuración de exportación de Blender no incluyó morph targets
3. ❌ El modelo tiene múltiples meshes y las shape keys están en uno diferente
4. ❌ Las shape keys están deshabilitadas o no se aplicaron correctamente

## ✅ Cómo Exportar Correctamente desde Blender

### Paso 1: Preparar las Shape Keys en Blender

1. **Selecciona tu modelo** (el objeto mesh, no la armature)
2. Ve al panel **Object Data Properties** (ícono de triángulo verde)
3. Busca la sección **Shape Keys**
4. Asegúrate de tener:
   - **Basis** (la forma base, siempre debe estar)
   - **Key1** (tu primera shape key)
   - **Key2** (tu segunda shape key)
   - Etc.

#### Verificación Visual:
```
Shape Keys
├─ 🔵 Basis (siempre en 1.0)
├─ 🔵 Key1 (puedes moverla de 0 a 1 para ver el efecto)
└─ 🔵 Key2 (puedes moverla de 0 a 1 para ver el efecto)
```

### Paso 2: Verificar que las Shape Keys Funcionen

Antes de exportar:
1. Selecciona **Basis** y ponla en 1.0
2. Selecciona **Key1** y mueve el valor de 0 a 1
3. ¿El modelo se deforma? ✅ Funciona
4. ¿No pasa nada? ❌ Las shape keys no están configuradas correctamente

### Paso 3: Exportar a GLTF/GLB

**⚠️ IMPORTANTE: Configuración de Exportación**

1. Ve a **File > Export > glTF 2.0 (.glb/.gltf)**

2. En el panel de exportación, configura:

   **✅ Include (Pestaña):**
   - ☑️ Selected Objects (si solo quieres el modelo seleccionado)
   - ☑️ Visible Objects (o toda la escena)
   - ☑️ Custom Properties
   - ☑️ Cameras (opcional)
   - ☑️ Punctual Lights (opcional)

   **✅ Transform (Pestaña):**
   - Transform: +Y Up (por defecto)
   - Forward: -Z Forward (por defecto)

   **✅ Geometry (Pestaña):**
   - ☑️ Apply Modifiers
   - ☑️ UVs
   - ☑️ Normals
   - ☑️ Tangents
   - ☑️ Vertex Colors (si las tienes)
   - ☑️ Materials: Export
   - ☑️ **Compression: None** (o Draco si lo soportas)

   **✅ Animation (Pestaña):**
   - ☑️ **Use Current Frame**
   - ☑️ **Animation** (incluso si no tienes animaciones)
   - ☑️ **Shape Keys** ⬅️ **¡MUY IMPORTANTE!**
   - ☑️ **Shape Key Normals**
   - ☑️ **Shape Key Tangents**
   - Group by NLA Track: Off
   - Sampling Rate: 1
   - ☑️ Always Sample Animations

3. **Exporta como GLB** (recomendado) o GLTF

## 🔧 Solución de Problemas Comunes

### ❌ Problema 1: "Shape Keys no se exportan"

**Causa**: La opción "Shape Keys" no está marcada en la exportación.

**Solución**: 
- En File > Export > glTF 2.0
- Pestaña **Animation**
- ☑️ Marcar **Shape Keys**
- ☑️ Marcar **Shape Key Normals**
- ☑️ Marcar **Shape Key Tangents**

### ❌ Problema 2: "Shape Keys existen pero no funcionan en A-Frame"

**Causa**: Versión de Blender o formato GLTF incompatible.

**Solución**:
1. Usa Blender **2.93 o superior**
2. Exporta como **GLB** (binario) en lugar de GLTF separado
3. Asegúrate de que "Animation" esté habilitada incluso sin animaciones

### ❌ Problema 3: "Shape Keys funcionan en Blender pero no en el navegador"

**Causa**: El mesh tiene modificadores sin aplicar.

**Solución**:
1. Aplica todos los modificadores antes de exportar (excepto Armature si la tienes)
2. En la exportación, asegúrate de que "Apply Modifiers" esté marcado

### ❌ Problema 4: "Solo algunas shape keys funcionan"

**Causa**: Nombres especiales o basis mal configurado.

**Solución**:
1. Asegúrate de que **Basis** esté siempre en 1.0
2. No uses nombres con espacios o caracteres especiales
3. Prueba con nombres simples: Key1, Key2, Key3, etc.

## 🧪 Verificar el Archivo Exportado

### Método 1: Visor Online
1. Ve a https://gltf-viewer.donmccurdy.com/
2. Arrastra tu archivo GLB
3. En el panel derecho, busca "Morph Targets"
4. Si aparecen, ✅ se exportaron correctamente

### Método 2: Consola del Navegador
1. Abre tu proyecto en el navegador
2. Presiona F12 (Consola)
3. Busca el mensaje: `✅ Morph targets encontrados: {...}`
4. Si sale `⚠️ No se encontraron morph targets`, el problema es la exportación

## 📋 Checklist de Exportación

Antes de exportar, verifica:

- [ ] Las shape keys funcionan en Blender (mueve los valores y ves el efecto)
- [ ] Basis está en 1.0
- [ ] Todas las shape keys tienen nombres simples sin espacios
- [ ] El objeto está seleccionado
- [ ] File > Export > glTF 2.0 (.glb/.gltf)
- [ ] ☑️ Apply Modifiers
- [ ] ☑️ Animation (pestaña)
- [ ] ☑️ Shape Keys ⬅️ **CRÍTICO**
- [ ] ☑️ Shape Key Normals
- [ ] ☑️ Shape Key Tangents
- [ ] Exportar como GLB (no GLTF separado)
- [ ] Verificar el archivo en https://gltf-viewer.donmccurdy.com/

## 🎓 Tutorial Paso a Paso

### Crear Shape Keys desde Cero (Si no las tienes)

1. **Selecciona tu mesh** en Object Mode
2. Ve a **Edit Mode** (Tab)
3. Regresa a **Object Mode**
4. Panel lateral derecho → **Object Data Properties** (ícono de triángulo)
5. Find **Shape Keys** → Click **+** (Add Shape Key)
6. Esto crea **Basis** automáticamente
7. Click **+** otra vez para crear **Key 1**
8. Entra en **Edit Mode** y mueve vértices para crear la deformación
9. Regresa a **Object Mode**
10. Desliza el valor de Key 1 para ver el efecto
11. Repite para Key 2, Key 3, etc.

### Nombres Personalizados

Puedes renombrar las shape keys:
1. Doble click sobre "Key 1" en la lista
2. Escribe un nuevo nombre (sin espacios): "Happy", "Angry", "Surprised"
3. El código los detectará con estos nombres

## 🔬 Verificación en el Código

Una vez exportado correctamente, el código debería mostrar:

```javascript
✅ Morph targets encontrados: { Key1: 0, Key2: 1 }
📊 Influences actuales: [0, 0]
🎭 Expresiones inicializadas: {...}
```

Si ves esto, ¡funciona! 🎉

## 💡 Tips Adicionales

1. **Usa GLB en lugar de GLTF**: Es más compatible y todo está en un archivo
2. **Versión de Blender**: Usa 3.0+ para mejor compatibilidad con glTF 2.0
3. **Prueba simple**: Crea un cubo, añade una shape key que lo estire, exporta
4. **Nombres**: Mantén nombres simples: Key1, Key2, Blink, Smile, etc.
5. **No uses**: Espacios, caracteres especiales, números al inicio

## 🆘 Si Nada Funciona

Envíame la información de la consola (F12):
- ¿Aparece "model-loaded"?
- ¿Qué dice sobre morph targets?
- ¿Hay algún error?

También puedes:
1. Compartir el archivo .blend
2. Verificar el .glb en https://gltf-viewer.donmccurdy.com/
3. Probar con un modelo de prueba simple

## 📚 Recursos Adicionales

- **Blender Manual**: https://docs.blender.org/manual/en/latest/animation/shape_keys/
- **glTF Shape Keys**: https://www.khronos.org/gltf/
- **A-Frame GLTF**: https://aframe.io/docs/1.5.0/components/gltf-model.html
