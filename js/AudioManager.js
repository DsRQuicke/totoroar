class AudioManager {
	constructor () {
		this.audioLoader = new THREE.AudioLoader();
		this.audioCache = {};
		this.audioListener = null;
	}

	/**	Sets the AudioListener object to use when creating new Audio or
	 *	PositionalAudio objects.
	 *
	 *	This must be called before making any playAudio() calls.
	 *	@param {THREE.AudioListener} audioListener - The listener this
	 *	AudioManager should use when creating new (Positional)Audio
	 *	objects.
	 */
	setListener(audioListener) {
		this.audioListener = audioListener;
	}

	/**
	 *	@param {string} name - A name that is used to store the audio
	 *	buffer in an internal map. This name can then also be used later
	 *	to retrieve the buffer again after it was loaded.
	 *	@param {string} src - The source url of the audio file to load.
	 *	@returns {Promise} A Promise that will resolve to an AudioBuffer
	 *	that is loaded via a three.js AudioLoader, if succesfull.
	 */
	loadAudio(name, src) {
		return new Promise((resolve, reject) => {
			if ( !name || !src ) {
				reject(new Error("Invalid parameters"));
				return;
			}
			this.audioLoader.load(src, (buffer) => {
				this.audioCache[name] = this.audioCache[name] || {};
				this.audioCache[name].buffer = buffer;
				resolve(buffer);
			}, null, (err) => {
				reject(new Error(`Failed to load ${err.currentTarget.src}`));
			});
		});
	}

	/**	@returns {AudioBuffer} The AudioBuffer associated with the given
	 *	name. If no audio buffer was previously loaded for this `name`
	 *	then `undefined` will be returned instead.
	 */
	getAudioBuffer(name) {
		if ( this.audioCache[name] ) {
			return this.audioCache[name].buffer;
		}
		return undefined;
	}

	/**	Will try to play the AudioBuffer associated with the provided
	 *	name.
	 *
	 *	TODO: Currently only a single instance of a sound can be played
	 *	at once. If we want to be able to support multiple instances,
	 *	we would need to keep track of the corresponding
	 *	(Positional)Audio-Object3D pairs. And thus create a new Audio
	 *	object for each such pair, instead of one (Positional)Audio
	 *	object per "buffer".
	 *	@param {string} name - The name of the audio file to play.
	 *	@param {THREE.Object3D} [objForAudio] - If provided the
	 *	requested audio file will be played back as a PositionalAudio
	 *	on the specified object. If not provided it will just be played
	 *	as a regular (ambient) Audio.
	 *	@param {Object} [options={}] - Playback options.
	 *	@param {boolean} [options.onlyIfNotPlaying=false] - If set to
	 *	<code>true</code>, then the audio will only be played if it's
	 *	not already playing.
	 *	@param {number} [options.refDistance=0.75] - If provided this
	 *	will be set as the reference distance (i.e. audio decay
	 *	distance). Only applicable when audio is being played as
	 *	positional, i.e. <code>objForAudio</code> is provided.
	 *	@param {boolean} [options.loop=false] - If set to
	 *	<code>true</code> then the sound will be played in loop mode.
	 *	@param {number} [options.fadeInTime=0] - If a non-zero
	 *	(positive) value is provided, then the sound will be faded in
	 *	over the provided time (in seconds).
	 */
	playAudio(name, objForAudio, options) {
		if ( !this.audioListener ) {
			console.error("No AudioListener assigned!");
			return;
		}
		const audioData = this.audioCache[name];
		if ( !audioData || !audioData.buffer ) {
			console.error(`No audio data for ${name}`);
			return;
		}

		options = options || {};
		const {
			onlyIfNotPlaying = false,
			refDistance = 0.75,
			loop = false,
			fadeInTime = 0
		} = options;

		let audioObj = null;
		// If an `objForAudio` is provided, we should play the sound
		// as a PositionalAudio. Otherwise a regular Audio.
		if ( objForAudio ) {
			// See if we've already created a PositionalAudio object
			// for this audio buffer. If not, create one now.
			if ( !audioData.posAudioObj ) {
				audioData.posAudioObj = new THREE.PositionalAudio(this.audioListener);
			}
			audioObj = audioData.posAudioObj;
			audioObj.setRefDistance(refDistance);
// TODO >>> Will this work as expected? And should we first stop the audio if
// TODO --- it's still playing on the previous object?
			// If the PositionalAudio object is currently attached
			// to another object. Then first remove it from the
			// current object and add it to the provided one.
			if ( audioObj.parent && audioObj.parent != objForAudio ) {
				audioObj.parent.remove(audioObj);
				objForAudio.add(audioObj);
			}
// TODO <<<
		} else {
			// See if we've already created an Audio object for this
			// audio buffer. If not, create one now.
			if ( !audioData.audioObj ) {
				audioData.audioObj = new THREE.Audio(this.audioListener);
			}
			audioObj = audioData.audioObj;
		}

		if ( audioObj.isPlaying ) {
// TODO >>> If the audio was previously playing on another object, should we
// TODO --- still play the audio on the new object?
			if ( onlyIfNotPlaying ) {
				return;
			}
			// Stop the current playback of the audio, so we can
			// play it again starting at the beginning.
			audioObj.stop();
		}

		audioObj.setBuffer(audioData.buffer);
		audioObj.setLoop(loop);

		// Apply fade-in if requested.
		const gainParam = audioObj.gain.gain;
		const audCtx = audioObj.context;
		if ( fadeInTime > 0 ) {
			gainParam.setValueAtTime(0, audCtx.currentTime);
			gainParam.linearRampToValueAtTime(gainParam.defaultValue, audCtx.currentTime+fadeInTime);
		} else {
			// Cancel any fade-ins that might still be in progress
			// when this method was called with a fadeInTime shortly
			// before the current call (without a fadeInTime).
			gainParam.cancelScheduledValues(audCtx.currentTime);
			gainParam.value = gainParam.defaultValue;
		}

		audioObj.play();
	}

// TODO >>> Provide option to select if playback should be stopped on only
// TODO --- the PositionalAudio, the Audio or both.
	/**	Stops playback of the provided audio name.
	 *	@param {string} name - The name of the audio file to play.
	 *	@param {Object} [options={}] - Stop options.
	 *	@param {number} [options.fadeOutTime=0] - If a non-zero
	 *	(positive) value is provided, then the sound will be faded out
	 *	over the provided period (in seconds). In this case the audio
	 *	thus won't be stopped immediately.
	 */
	stopAudio(name, options) {
		const audioData = this.audioCache[name];
		if ( !audioData ) {
			return;
		}

		options = options || {};
		const {
			fadeOutTime = 0
		} = options;
		// Note: For simplicity we don't take the current progress of
		// the audio into account. For example a non-looping audio
		// might be closer to its end than the provided fadeOutTime. In
		// which case the fade out will have not been fully completed
		// by the time the audio ends. To take this into account we
		// should calculate the remaining time (for non-loop audio). And
		// if it's smaller than fadeOutTime, then adjust fadeOutTime to
		// be the remainging Time. But, though we can get an
		// AudioBuffer's duration, there is no "progress" property.
		// Instead we could/should use the internal `_startedAt`
		// property of the Three.js Audio object, and calculate the
		// progress in similar way as it's done in the source code
		// of Three.js's Audio#pause().
		const fadeOutAndStopFn = (audioObj, fadeTime) => {
			const gainParam = audioObj.gain.gain;
			const audCtx = audioObj.context;
			gainParam.setValueAtTime(gainParam.value, audCtx.currentTime);
			gainParam.linearRampToValueAtTime(0, audCtx.currentTime + fadeTime);
			// Since Three.js's Audio object doesn't allow us to
			// schedule a stop() in the future, we must use the
			// Web Audio API's underlying AudioNode's "ended" event.
			// When this event is triggered, we'll call Three.js's
			// stop() method to make sure it's in a valid state.
			// Note: That Three.js also assigns a callback to the
			// AudioNode's onended property.
			const endedHandler = () => {
				audioObj.source.removeEventListener("ended", endedHandler);
				audioObj.stop();
			};
			audioObj.source.addEventListener("ended", endedHandler);
			audioObj.source.stop(audCtx.currentTime + fadeTime);
		};

		if ( audioData.posAudioObj ) {
			if ( fadeOutTime > 0 ) {
				fadeOutAndStopFn(audioData.posAudioObj, fadeOutTime);
			} else {
				audioData.posAudioObj.stop();
			}
		}
		if ( audioData.audioObj ) {
			if ( fadeOutTime > 0 ) {
				fadeOutAndStopFn(audioData.audioObj, fadeOutTime);
			} else {
				audioData.audioObj.stop();
			}
		}
	}
// TODO <<<

	/**	Stops playback of all audio.
	 *	@param {Array.<string>} [except=[]] - An array of sound names
	 *	that should not be stopped.
	 */
	stopAll(except=[]) {
		for ( const name of Object.keys(this.audioCache) ) {
			if ( !except.includes(name) ) {
				this.stopAudio(name);
			}
		}
	}

	disposeAll() {
		stopAll();
		// TODO Do we need to clean up the AudioBuffer objects? Or will
		// the Web Audio API handle this?
		this.audioCache = {};
	}
}

