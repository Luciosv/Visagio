// Umbrales del gate de calidad (sección 7.3 de CLAUDE.md). Todos en un solo
// archivo, comentados, porque van a cambiar mucho durante la calibración con
// el barbero (sección 17: "los umbrales de clasificación en un solo archivo
// de constantes, comentados con su justificación").

/**
 * Yaw máximo tolerado, en grados, antes de rechazar la foto.
 * Valor tomado directo de la spec (7.3). Rechaza porque un giro de cabeza
 * grande distorsiona el ancho relativo de mejillas/mandíbula.
 */
export const MAX_YAW_DEG = 8

/**
 * Pitch máximo tolerado, en grados, antes de rechazar la foto.
 * Valor tomado directo de la spec (7.3). Mirar arriba/abajo altera el largo
 * de cara percibido (foreshortening).
 */
export const MAX_PITCH_DEG = 10

/**
 * A partir de este roll, en grados, la imagen se corrige rotando en vez de
 * rechazarse (7.3: "el roll se corrige rotando, no rechazando"). Mismo valor
 * numérico que pitch en la spec, pero es un umbral distinto conceptualmente:
 * acá dispara una corrección automática, no un rechazo.
 */
export const ROLL_CORRECTION_THRESHOLD_DEG = 10

/**
 * Fracción mínima del alto de la imagen que tiene que ocupar el bounding box
 * facial. Por debajo, la cara está demasiado lejos de la cámara y los
 * landmarks pierden precisión. Valor de la spec (7.3): "> 25% del alto de la
 * imagen".
 */
export const MIN_FACE_HEIGHT_FRACTION = 0.25

/**
 * Umbral mínimo de varianza del laplaciano sobre el recorte facial, por
 * debajo del cual la foto se considera borrosa.
 *
 * Punto de partida, NO calibrado con fotos de barbería reales todavía.
 * La referencia clásica de detección de blur por varianza de laplaciano
 * (Pech-Pacheco et al. 2000, popularizada por el blog de PyImageSearch) usa
 * un umbral de referencia ~100 sobre la imagen completa a resoluciones
 * similares a las nuestras (~1024px de lado largo). Acá lo bajamos a 60
 * porque:
 *   (a) medimos varianza solo sobre el recorte facial, que tiene menos
 *       textura/contraste de alta frecuencia que una escena completa, y
 *   (b) las fotos de celular en luz de barbería vienen con ruido y
 *       compresión JPEG que ya bajan la varianza incluso en tomas nítidas.
 * Hay que recalibrar este número con fotos reales del barbero antes de
 * confiar en el rechazo por nitidez en producción.
 */
export const MIN_SHARPNESS_VARIANCE = 60
