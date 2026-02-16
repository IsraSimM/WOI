/**
 * Controlador de Morph Targets (Shape Keys) para modelos GLTF
 * Permite cambiar expresiones faciales o deformaciones del modelo
 */

export class MorphTargetController {
  constructor(entityId) {
    this.entityId = entityId;
    this.entity = null;
    this.meshes = []; // Array de meshes con morph targets
    this.morphTargets = {};
    this.currentExpression = 'neutral';
    this.isReady = false;
    
    // Expresiones predefinidas (valores de 0 a 1 para cada shape key)
    this.expressions = {
      neutral: {},  // Se llenará automáticamente con valores 0
      happy: {},    // Key1
      angry: {},    // Key2
      custom: {}
    };
    
    // Callback cuando cambia la expresión
    this.onExpressionChange = null;
  }
  
  /**
   * Inicializa el controlador y espera a que el modelo GLTF esté cargado
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.entity = document.getElementById(this.entityId);
      
      if (!this.entity) {
        reject(new Error(`Entidad ${this.entityId} no encontrada`));
        return;
      }
      
      // Esperar a que el modelo esté cargado
      if (this.entity.hasLoaded) {
        this._setupMorphTargets();
        resolve();
      } else {
        this.entity.addEventListener('model-loaded', () => {
          this._setupMorphTargets();
          resolve();
        });
      }
    });
  }
  
  /**
   * Configura los morph targets del modelo
   * @private
   */
  _setupMorphTargets() {
    const model = this.entity.getObject3D('mesh');
    
    if (!model) {
      console.warn('❌ No se encontró el modelo 3D en la entidad');
      console.log('📋 Entidad:', this.entity);
      console.log('📋 Object3D disponibles:', Object.keys(this.entity.object3D.children));
      return;
    }
    
    console.log('🔍 Buscando morph targets en el modelo...');
    let meshCount = 0;
    let meshesWithMorphs = 0;
    
    // Buscar el mesh con morph targets
    model.traverse((node) => {
      if (node.isMesh) {
        meshCount++;
        console.log(`  📦 Mesh encontrado: "${node.name || 'sin nombre'}"`);
        console.log(`     - Tiene morphTargetDictionary: ${!!node.morphTargetDictionary}`);
        console.log(`     - Tiene morphTargetInfluences: ${!!node.morphTargetInfluences}`);
        
        if (node.morphTargetInfluences) {
          console.log(`     - Número de influences: ${node.morphTargetInfluences.length}`);
        }
        
        if (node.morphTargetDictionary) {
          console.log(`     - Morph targets:`, node.morphTargetDictionary);
          meshesWithMorphs++;
        }
      }
      
      if (node.isMesh && node.morphTargetInfluences && node.morphTargetDictionary) {
        // Guardar referencia al mesh
        this.meshes.push(node);
        
        // Usar el primer mesh para obtener los nombres de morph targets
        if (Object.keys(this.morphTargets).length === 0) {
          this.morphTargets = node.morphTargetDictionary;
          
          console.log('✅ Morph targets encontrados:', this.morphTargets);
          console.log('📊 Influences actuales:', node.morphTargetInfluences);
          console.log('📊 Número de morph targets:', Object.keys(this.morphTargets).length);
        }
      }
    });
    
    console.log(`📊 Resumen: ${meshCount} meshes encontrados, ${meshesWithMorphs} con morph targets`);
    
    if (this.meshes.length === 0) {
      console.warn('❌ No se encontraron morph targets en el modelo');
      console.warn('💡 Verifica que:');
      console.warn('   1. El modelo tiene Shape Keys en Blender');
      console.warn('   2. Exportaste con la opción "Shape Keys" habilitada');
      console.warn('   3. La pestaña "Animation" está habilitada en la exportación');
      console.warn('   4. Exportaste como GLB (no GLTF separado)');
      console.warn('📚 Ver guía: docs/BLENDER_SHAPE_KEYS_EXPORT.md');
    } else {
      console.log(`✅ Sistema listo con ${this.meshes.length} mesh(es)`);
      
      // Inicializar expresiones con los morph targets disponibles
      this._initializeExpressions();
      
      // Aplicar expresión neutral inicial
      this._applyMorphTargets(this.expressions.neutral);
      
      this.isReady = true;
    }
  }
  
  /**
   * Inicializa las expresiones predefinidas basadas en los morph targets disponibles
   * @private
   */
  _initializeExpressions() {
    if (!this.morphTargets) return;
    
    // Neutral: todos los valores a 0
    this.expressions.neutral = {};
    Object.keys(this.morphTargets).forEach(key => {
      this.expressions.neutral[key] = 0;
    });
    
    // Happy: usa Key1 (o el primer morph target disponible)
    this.expressions.happy = { ...this.expressions.neutral };
    if ('Key1' in this.morphTargets) {
      this.expressions.happy['Key1'] = 1.0;
    } else if (Object.keys(this.morphTargets).length > 0) {
      const firstKey = Object.keys(this.morphTargets)[0];
      this.expressions.happy[firstKey] = 1.0;
    }
    
    // Angry: usa Key2 (o el segundo morph target disponible)
    this.expressions.angry = { ...this.expressions.neutral };
    if ('Key2' in this.morphTargets) {
      this.expressions.angry['Key2'] = 1.0;
    } else if (Object.keys(this.morphTargets).length > 1) {
      const secondKey = Object.keys(this.morphTargets)[1];
      this.expressions.angry[secondKey] = 1.0;
    }
    
    console.log('🎭 Expresiones inicializadas:', this.expressions);
  }
  
  /**
   * Cambia a una expresión predefinida
   * @param {string} expressionName - Nombre de la expresión ('neutral', 'happy', 'angry', 'custom')
   * @param {number} duration - Duración de la transición en ms (0 = instantáneo)
   */
  setExpression(expressionName, duration = 200) {
    if (!this.isReady) {
      console.warn('Controlador no está listo aún');
      return;
    }
    
    if (!this.expressions[expressionName]) {
      console.warn(`Expresión "${expressionName}" no existe`);
      return;
    }
    
    const targetValues = this.expressions[expressionName];
    
    if (duration === 0) {
      this._applyMorphTargets(targetValues);
    } else {
      this._animateToExpression(targetValues, duration);
    }
    
    this.currentExpression = expressionName;
    
    if (this.onExpressionChange) {
      this.onExpressionChange(expressionName);
    }
    
    console.log(`🎭 Expresión cambiada a: ${expressionName}`);
  }
  
  /**
   * Aplica valores directamente a los morph targets
   * @param {Object} values - Objeto con pares {morphTargetName: value}
   * @private
   */
  _applyMorphTargets(values) {
    if (this.meshes.length === 0) return;
    
    // Aplicar a todos los meshes
    this.meshes.forEach(mesh => {
      Object.keys(values).forEach(key => {
        const index = this.morphTargets[key];
        if (index !== undefined && mesh.morphTargetInfluences) {
          mesh.morphTargetInfluences[index] = values[key];
        }
      });
    });
  }
  
  /**
   * Anima suavemente hacia una expresión
   * @param {Object} targetValues - Valores objetivo
   * @param {number} duration - Duración en ms
   * @private
   */
  _animateToExpression(targetValues, duration) {
    if (this.meshes.length === 0) return;
    
    // Obtener valores iniciales del primer mesh
    const startValues = {};
    Object.keys(this.morphTargets).forEach(key => {
      const index = this.morphTargets[key];
      startValues[key] = this.meshes[0].morphTargetInfluences[index] || 0;
    });
    
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      // Aplicar a todos los meshes
      this.meshes.forEach(mesh => {
        Object.keys(this.morphTargets).forEach(key => {
          const index = this.morphTargets[key];
          const start = startValues[key];
          const target = targetValues[key] || 0;
          const current = start + (target - start) * eased;
          if (mesh.morphTargetInfluences) {
            mesh.morphTargetInfluences[index] = current;
          }
        });
      });
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }
  
  /**
   * Establece un valor específico para un morph target
   * @param {string} morphTargetName - Nombre del morph target
   * @param {number} value - Valor entre 0 y 1
   */
  setMorphTarget(morphTargetName, value) {
    if (!this.isReady || this.meshes.length === 0) return;
    
    const index = this.morphTargets[morphTargetName];
    if (index !== undefined) {
      const clampedValue = Math.max(0, Math.min(1, value));
      
      // Aplicar a todos los meshes
      this.meshes.forEach(mesh => {
        if (mesh.morphTargetInfluences) {
          mesh.morphTargetInfluences[index] = clampedValue;
        }
      });
      
      console.log(`🎚️ ${morphTargetName} = ${clampedValue.toFixed(2)}`);
    }
  }
  
  /**
   * Obtiene el valor actual de un morph target
   * @param {string} morphTargetName
   * @returns {number}
   */
  getMorphTarget(morphTargetName) {
    if (!this.isReady || this.meshes.length === 0) return 0;
    
    const index = this.morphTargets[morphTargetName];
    if (index !== undefined && this.meshes[0].morphTargetInfluences) {
      return this.meshes[0].morphTargetInfluences[index];
    }
    return 0;
  }
  
  /**
   * Obtiene todos los morph targets disponibles
   * @returns {Object}
   */
  getMorphTargets() {
    return this.morphTargets || {};
  }
  
  /**
   * Obtiene la expresión actual
   * @returns {string}
   */
  getCurrentExpression() {
    return this.currentExpression;
  }
  
  /**
   * Define una expresión personalizada
   * @param {string} name - Nombre de la expresión
   * @param {Object} values - Valores de los morph targets
   */
  defineExpression(name, values) {
    this.expressions[name] = values;
    console.log(`✨ Expresión personalizada "${name}" definida`);
  }
  
  /**
   * Resetea todos los morph targets a 0
   */
  reset() {
    this.setExpression('neutral', 0);
  }
}

// Sistema global para gestionar múltiples controladores
class MorphTargetManager {
  constructor() {
    this.controllers = new Map();
  }
  
  /**
   * Registra un controlador para una entidad
   */
  register(entityId, controller) {
    this.controllers.set(entityId, controller);
  }
  
  /**
   * Obtiene un controlador por ID de entidad
   */
  get(entityId) {
    return this.controllers.get(entityId);
  }
  
  /**
   * Elimina un controlador
   */
  unregister(entityId) {
    this.controllers.delete(entityId);
  }
}

// Instancia global
export const morphTargetManager = new MorphTargetManager();
