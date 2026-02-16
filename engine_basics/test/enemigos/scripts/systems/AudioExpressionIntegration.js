/**
 * Integración entre AudioSystem y MorphTargetController
 * Sincroniza expresiones faciales con eventos de audio
 */

import { EnemyAudioSystem } from './AudioSystem.js';
import { MorphTargetController } from './MorphTargetController.js';

export class AudioExpressionController {
  constructor(entityId) {
    this.entityId = entityId;
    this.audioSystem = null;
    this.morphController = null;
    this.isInitialized = false;
    
    // Mapeo de sonidos a expresiones
    this.soundToExpression = {
      monsterView: { expression: 'angry', duration: 150 },
      approaching1: { expression: 'happy', duration: 200 },
      approaching2: { expression: 'happy', duration: 200 },
      monsterEat: { expression: 'angry', duration: 0 }, // Instantáneo
    };
    
    // Configuración de comportamiento
    this.config = {
      enableAutoExpressions: true,
      neutralizeOnIdle: true,
      idleTimeout: 3000, // ms sin sonidos antes de volver a neutral
      defaultExpression: 'neutral',
    };
    
    this.lastSoundTime = 0;
    this.idleCheckInterval = null;
  }
  
  /**
   * Inicializa ambos sistemas
   */
  async initialize(audioSoundElements) {
    try {
      // Inicializar MorphTargetController
      this.morphController = new MorphTargetController(this.entityId);
      await this.morphController.initialize();
      
      // Inicializar AudioSystem
      this.audioSystem = new EnemyAudioSystem();
      this.audioSystem.initialize(audioSoundElements);
      
      // Conectar sistemas
      this._setupCallbacks();
      
      // Iniciar verificación de idle
      if (this.config.neutralizeOnIdle) {
        this._startIdleCheck();
      }
      
      this.isInitialized = true;
      console.log('✅ AudioExpressionController inicializado');
      
      return {
        audio: this.audioSystem,
        morph: this.morphController,
      };
    } catch (error) {
      console.error('❌ Error al inicializar AudioExpressionController:', error);
      throw error;
    }
  }
  
  /**
   * Configura los callbacks entre sistemas
   * @private
   */
  _setupCallbacks() {
    // Cuando suena el audio, cambiar expresión
    this.audioSystem.onSoundPlay = (soundKey) => {
      this.lastSoundTime = Date.now();
      
      if (this.config.enableAutoExpressions) {
        this._handleSoundExpression(soundKey);
      }
    };
    
    // Cuando cambia la expresión, notificar (opcional)
    this.morphController.onExpressionChange = (expression) => {
      console.log(`🎭 Expresión cambiada a: ${expression}`);
    };
  }
  
  /**
   * Maneja el cambio de expresión según el sonido
   * @private
   */
  _handleSoundExpression(soundKey) {
    const mapping = this.soundToExpression[soundKey];
    
    if (mapping && this.morphController.isReady) {
      this.morphController.setExpression(
        mapping.expression,
        mapping.duration
      );
    }
  }
  
  /**
   * Inicia la verificación de idle
   * @private
   */
  _startIdleCheck() {
    this.idleCheckInterval = setInterval(() => {
      const timeSinceLastSound = Date.now() - this.lastSoundTime;
      
      if (timeSinceLastSound > this.config.idleTimeout) {
        const currentExpression = this.morphController.getCurrentExpression();
        
        if (currentExpression !== this.config.defaultExpression) {
          this.morphController.setExpression(
            this.config.defaultExpression,
            500 // Transición suave de vuelta a neutral
          );
        }
      }
    }, 1000); // Verificar cada segundo
  }
  
  /**
   * Actualiza el sistema de audio basado en posiciones
   */
  update(enemyPosition, playerPosition) {
    if (this.audioSystem) {
      this.audioSystem.update(enemyPosition, playerPosition);
    }
  }
  
  /**
   * Configura el mapeo de sonidos a expresiones
   */
  setSoundMapping(soundKey, expression, duration = 200) {
    this.soundToExpression[soundKey] = { expression, duration };
  }
  
  /**
   * Configura el comportamiento del controlador
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Si se desactivó idle check, limpiar intervalo
    if (!this.config.neutralizeOnIdle && this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    
    // Si se activó idle check, iniciarlo
    if (this.config.neutralizeOnIdle && !this.idleCheckInterval) {
      this._startIdleCheck();
    }
  }
  
  /**
   * Habilita o deshabilita expresiones automáticas
   */
  setAutoExpressions(enabled) {
    this.config.enableAutoExpressions = enabled;
  }
  
  /**
   * Cambia manualmente una expresión
   */
  setExpression(expression, duration = 200) {
    if (this.morphController) {
      this.morphController.setExpression(expression, duration);
    }
  }
  
  /**
   * Reproduce un sonido específico (y su expresión asociada)
   */
  playSound(soundKey) {
    if (this.audioSystem) {
      this.audioSystem.playSound(soundKey);
    }
  }
  
  /**
   * Limpia recursos
   */
  destroy() {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }
    
    if (this.audioSystem) {
      this.audioSystem.reset();
    }
    
    if (this.morphController) {
      this.morphController.reset();
    }
  }
  
  /**
   * Acceso a sistemas individuales
   */
  getAudioSystem() {
    return this.audioSystem;
  }
  
  getMorphController() {
    return this.morphController;
  }
}

// Ejemplo de uso:
/*

import { AudioExpressionController } from './scripts/systems/AudioExpressionIntegration.js';

// Crear controlador integrado
const controller = new AudioExpressionController('enemy');

// Inicializar
const systems = await controller.initialize({
  approaching1: document.getElementById('sound-approaching1'),
  approaching2: document.getElementById('sound-approaching2'),
  monsterView: document.getElementById('sound-monster-view'),
  monsterEat: document.getElementById('sound-monster-eat'),
});

// Configurar
controller.configure({
  enableAutoExpressions: true,
  neutralizeOnIdle: true,
  idleTimeout: 2000,
});

// Personalizar mapeo
controller.setSoundMapping('monsterView', 'angry', 100);
controller.setSoundMapping('monsterEat', 'angry', 0);

// En el loop de juego
function gameLoop() {
  const enemyPos = enemy.getAttribute('position');
  const playerPos = player.getAttribute('position');
  
  controller.update(enemyPos, playerPos);
  
  requestAnimationFrame(gameLoop);
}

*/
