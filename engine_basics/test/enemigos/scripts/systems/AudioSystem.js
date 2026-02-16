/**
 * Sistema de Audio para Enemigos
 * Gestiona los sonidos del enemigo basados en la distancia y visibilidad del jugador
 */

export class EnemyAudioSystem {
  constructor() {
    this.sounds = {
      approaching1: null,
      approaching2: null,
      monsterView: null,
      monsterEat: null,
    };
    
    this.config = {
      // Distancias en unidades del mundo
      closeDistance: 8,      // Distancia para sonidos "approaching"
      veryCloseDistance: 4,  // Distancia para alternar entre approaching1 y 2
      viewDistance: 15,      // Distancia de campo de visión
      
      // Control de reproducción
      approachingCooldown: 3000,  // ms entre reproducciones de "approaching"
      viewCooldown: 5000,         // ms entre reproducciones de "view"
    };
    
    this.state = {
      lastApproachingTime: 0,
      lastViewTime: 0,
      currentApproachingSound: 1,
      isInView: false,
      wasInView: false,
      isClose: false,
      wasClose: false,
    };
    
    this.enabled = true;
    this.initialized = false;
    
    // Callback para notificar cuando se reproduce un audio
    this.onSoundPlay = null;
  }
  
  /**
   * Inicializa el sistema de audio con referencias a los elementos de A-Frame
   * @param {Object} soundElements - Objeto con las referencias a los elementos <a-sound>
   * @param {HTMLElement} soundElements.approaching1
   * @param {HTMLElement} soundElements.approaching2
   * @param {HTMLElement} soundElements.monsterView
   * @param {HTMLElement} soundElements.monsterEat (opcional)
   */
  initialize(soundElements) {
    this.sounds.approaching1 = soundElements.approaching1;
    this.sounds.approaching2 = soundElements.approaching2;
    this.sounds.monsterView = soundElements.monsterView;
    this.sounds.monsterEat = soundElements.monsterEat || null;
    
    this.initialized = true;
    console.log('✅ EnemyAudioSystem inicializado');
  }
  
  /**
   * Actualiza el sistema de audio basado en la posición del enemigo y jugador
   * @param {Object} enemyPosition - {x, y, z}
   * @param {Object} playerPosition - {x, y, z}
   */
  update(enemyPosition, playerPosition) {
    if (!this.initialized || !this.enabled) return;
    
    const distance = this.calculateDistance(enemyPosition, playerPosition);
    const currentTime = Date.now();
    
    // Verificar campo de visión (sonido "monster_view")
    this.state.isInView = distance <= this.config.viewDistance;
    
    if (this.state.isInView && !this.state.wasInView) {
      // El jugador acaba de entrar al campo de visión
      if (currentTime - this.state.lastViewTime > this.config.viewCooldown) {
        this.playSound('monsterView');
        this.state.lastViewTime = currentTime;
      }
    }
    
    // Verificar proximidad (sonidos "approaching")
    this.state.isClose = distance <= this.config.closeDistance;
    
    if (this.state.isClose) {
      if (currentTime - this.state.lastApproachingTime > this.config.approachingCooldown) {
        // Alternar entre approaching1 y approaching2 según distancia
        if (distance <= this.config.veryCloseDistance) {
          // Muy cerca: más frecuente, alternar rápido
          this.playApproachingSound();
        } else {
          // Cerca pero no tanto
          this.playApproachingSound();
        }
        this.state.lastApproachingTime = currentTime;
      }
    }
    
    // Actualizar estados previos
    this.state.wasInView = this.state.isInView;
    this.state.wasClose = this.state.isClose;
  }
  
  /**
   * Reproduce uno de los sonidos "approaching", alternando entre 1 y 2
   */
  playApproachingSound() {
    const soundKey = this.state.currentApproachingSound === 1 ? 'approaching1' : 'approaching2';
    this.playSound(soundKey);
    
    // Alternar para la próxima vez
    this.state.currentApproachingSound = this.state.currentApproachingSound === 1 ? 2 : 1;
  }
  
  /**
   * Reproduce un sonido específico
   * @param {string} soundKey - Clave del sonido ('approaching1', 'approaching2', 'monsterView', 'monsterEat')
   * @param {boolean} force - Si es true, reproduce sin cooldown
   */
  playSound(soundKey, force = false) {
    const soundElement = this.sounds[soundKey];
    
    if (!soundElement) {
      console.warn(`Sonido "${soundKey}" no disponible`);
      return;
    }
    
    // Verificar si el componente sound existe
    const soundComponent = soundElement.components.sound;
    if (soundComponent) {
      soundComponent.stopSound();
      soundComponent.playSound();
      console.log(`🔊 Reproduciendo: ${soundKey}${force ? ' (forzado)' : ''}`);
      
      // Llamar callback si existe
      if (this.onSoundPlay) {
        this.onSoundPlay(soundKey);
      }
    }
  }
  
  /**
   * Calcula la distancia euclidiana entre dos puntos 3D
   */
  calculateDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  /**
   * Configura los parámetros del sistema
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Configuración actualizada:', this.config);
  }
  
  /**
   * Habilita o deshabilita el sistema de audio
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`🔊 Sistema de audio: ${enabled ? 'Habilitado' : 'Deshabilitado'}`);
  }
  
  /**
   * Reinicia el estado del sistema
   */
  reset() {
    this.state = {
      lastApproachingTime: 0,
      lastViewTime: 0,
      currentApproachingSound: 1,
      isInView: false,
      wasInView: false,
      isClose: false,
      wasClose: false,
    };
    console.log('🔄 Sistema de audio reiniciado');
  }
  
  /**
   * Reproduce el sonido de "comer" (cuando el enemigo alcanza al jugador)
   * Este sonido siempre se reproduce sin cooldown
   */
  playEatSound() {
    if (this.sounds.monsterEat) {
      this.playSound('monsterEat', true);
    }
  }
}

// Instancia singleton (opcional, para uso global)
export const enemyAudioSystem = new EnemyAudioSystem();
  

/*

import { EnemyAudioSystem } from './scripts/systems/AudioSystem.js';
const audioSystem = new EnemyAudioSystem();
audioSystem.initialize(soundElements);
audioSystem.update(enemyPos, playerPos); // En cada frame

*/