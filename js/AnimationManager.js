class AnimationManager {
	/**	Constructs an AnimationManager.
	 *
	 *	@param {Object3D} obj - The THREE.js object that should be
	 *	animated.
	 *	@param {Array} animClips - The array of animations clips
	 *	associated with the provided object.
	 */
	constructor(obj, animClips) {
		if ( !obj || !Array.isArray(animClips) ) {
			throw new Error("Can't create AnimationManager with invalid parameters.");
		}
		this.animMxr = new THREE.AnimationMixer(obj);
		// Convert the array of clips to a dictionary, so we can more
		// easily retrieve them later.
		this.animClips = {};
		animClips.forEach((clip) => {
			this.animClips[clip.name] = clip;
		});
		// Info about the current action.
		this.currentBaseAnimInfo = null;
		// A queue that is used to play multiple animation after each
		// other.
		this.animQueue = [];
		this.timerId = 0;
		this.defaultFadeTime = 0.25; // [s]
	}

	/**	@typedef {object} AnimOpts
	 *	An object representing an animation to be played, with optional
	 *	options that can influence the playback.
	 *	@property {string} name - The name of the animation.
	 *	@property {number} [fadeTime=0.25] - The time to use to fade-in
	 *	the animation. Use 0 to disable fading.
	 *	@property {boolean} [loop=false] - Whether or not this animation
	 *	should be looped. Note that only the last base animation in the
	 *	queue is allowed to loop. Any others will be forced to
	 *	non-looping.
	 *	@property {boolean} [clamp=false] - Whether or not to clamp
	 *	the animation at the end of its playback.
	 *	@property {boolean} [isMixin=false] - If set to true then
	 *	the animation will be played without switching out the current
	 *	animation. I.e. the animation will be "mixed" in. Also the
	 *	AnimationManager will not wait for this animation to end before
	 *	moving checking the next queued animation.
	 *	@property {number} [delay=0] - Delay before starting the
	 *	animation.
	 *	@property {boolean} [reverse=false] - If enabled, this animation
	 *	will be played in reverse.
	 *	@property {Array<string>} [disableAnims=null] - If specified,
	 *	then the <code>enabled</code> property of the
	 *	<code>AnimationAction</code>s corresponding to the animation
	 *	names in the provided array, will be set to false. This is
	 *	usefull to make sure a previously enabled animation no longer
	 *	influences the weights of this (and other animations). I.e.
	 *	while an animation is enabled, it will cause it to be taken into
	 *	consideration (even when paused due to a clampWhenFinished)
	 *	during the weight normalization of animations that Three.js
	 *	applies by default.
	 *	@property {Object3D} [altRoot=null] - If set, the provided
	 *	object will be used as the (alternative) root for this
	 *	animation. Note that currently the AnimationManager's
	 *	<code>currentBaseAnimInfo</code> will be updated even if this is
	 *	used. A future animation might thus be trying to cross-fade from
	 *	an animation of another root object.
	 *	@property {boolean} [forcePlaythrough=false] - If set, then this
	 *	animation will always be played fully. I.e. this animation
	 *	won't be dequeued by a call to playAnimations(). So any
	 *	forcePlaythrough-ed animations will be played and new animations
	 *	will always be queued after them (unless clearQueue() was called
	 *	first). This option only has an impact on non-looping base
	 *	animations, for others the option will be ignored.
	 *	@property {function|null} [callback=null] - A callback function
	 *	that, if provided, will be called when the animation is being
	 *	processed for playing as the next animations. The callback will
	 *	be provided with a single parameter: the name of the animation.
	 *	@todo Check if Three.js would just ignore cross-fading actions
	 *	associated with different roots, in which case we could just
	 *	update the <code>currentBaseAnimInfo</code> even if we're using
	 *	an altRoot.
	 */
	/**	Goes through the specified animations in order.
	 *
	 *	Note that if multiple animations are provided, then all except
	 *	the last animation will be forced to use THREE.LoopOnce as their
	 *	loop mode.
	 *	Any previously enqueued animations (that didn't have their
	 *	<code>forcePlaythrough</code> flag set) will be removed from the
	 *	queue. But any currently playing animation will still continue
	 *	until it is cross-faded (or disabled) by the new animations.
	 *	The cross-fade will happen immediately if the current animation
	 *	doesn't have its <code>forcePlaythrough</code> set, or near its
	 *	end if it does.
	 *	@param {Array<AnimOpts>|AnimOpts} anims - A list of animation to
	 *	play. Each animation is denoted by an <code>AnimOpts</code>
	 *	object which specifies the animation name and any options.
	 *	@see AnimOpts
	 *	@see AnimationManager#queueAnimations
	 */
	playAnimations(anims) {
		return this.queueAnimations(anims, true);
	}

	/**	Will enqueue the provided animations for playback.
	 *
	 *	This method is similar to playAnimations(). But instead of
	 *	replacing the current queue of animations, this method will
	 *	add them to the current list. So they will be played after
	 *	the animations that were already in the queue. (Unless the
	 *	<code>_purgeNonForced</code> param was set.)
	 *	@param {Array<AnimOpts>|AnimOpts} anims - A list of animation to
	 *	add to the playlist. Each animation is denoted by an
	 *	<code>AnimOpts</code> object which specifies the animation name
	 *	and any options.
	 *	@param {boolean} [_purgeNonForced=false] - Used by
	 *	playAnimations() to force playback of the new animations to
	 *	start as soon as possible. I.e. this will remove any animations
	 *	in the current queue that didn't have a
	 *	<code>forcePlaythrough</code> flag set. And if there's an
	 *	animation currently playing that doesn't have the
	 *	<code>forcePlaythrough</code> flag set, then the next queued
	 *	animations will also be started immediately.
	 *	@see AnimOpts
	 *	@see AnimationManager#playAnimations
	 */
	queueAnimations(anims, _purgeNonForced=false) {
		if ( !anims ) {
			console.warn("No animations provided.");
			return;
		}
		if ( !Array.isArray(anims) ) {
			anims = [anims];
		}

		if ( _purgeNonForced ) {
			// Remove all non-forcePlaythrough animations from the
			// queue.
			this.animQueue = this.animQueue.filter((item) => {
				return item["forcePlaythrough"] || false;
			});
		}

		// Add the new animations after the (remaining) queued ones.
		this.animQueue.push(...anims);

		// If there was no more animation playing, just start the
		// first of the newly enqueued animations.
		// Also if there is an animation still playing, but its a
		// looping one (in which case the `endTime` will be `null`),
		// then also just start the next animation.
		// Similary, start the next animation if `_purgeNonForced` was
		// used and the current animation doesn't have its
		// `forcePlaythrough` flag set.
		if ( !this.currentBaseAnimInfo || !this.currentBaseAnimInfo.endTime || (_purgeNonForced && !this.currentBaseAnimInfo.forcePlaythrough) ) {
			return this._playNextAnim();
		}

		// If there is still a non-looping animation but it previously
		// was the last one (i.e. `startNextTime` is `null`), then start
		// the next newly queued base animation when the current one
		// ends (or slightly earlier if there was a fadeTime).
		if ( !this.currentBaseAnimInfo.startNextTime ) {
			let startTime = this.currentBaseAnimInfo.endTime;
			const nextBaseAnim = this._findNextBaseAnim();
			if ( nextBaseAnim ) {
				let fadeTime = nextBaseAnim["fadeTime"];
				if ( fadeTime != null ) {
					fadeTime = Math.max(0, fadeTime);
				} else {
					fadeTime = this.defaultFadeTime;
				}
				// Note: If the AnimationMixer's time has
				// already passed the new `startTime`, then
				// update() will provide _playNextAnim() with a
				// delta time (which will/should skip the
				// new animation forward to the corrected time).
				startTime -= fadeTime;
			}
			this.currentBaseAnimInfo.startNextTime = startTime;
		}
		// If there is still a non-looping animation, and another one
		// was also still queued (i.e. there is a `startNextTime` then
		// we don't need to do anything.
	}

	/**	Fully clears the current animation queue, irregardless of their
	 *	`forcePlaythrough` value.
	 *
	 *	Note that this doesn't stop any currently playing animation.
	 *	@param {boolean} [removeForcedPlayFromCurrent=false] - If set
	 *	and there is currently an animation playing that has its
	 *	`forcePlaythrough` flag set, then that flag will also be set to
	 *	<code>false</code>. Note though that the animation will still
	 *	continue to play (until it ends or is replaced with another
	 *	animation).
	 */
	clearQueue(removeForcedPlayFromCurrent=false) {
		this.animQueue = [];
		if ( removeForcedPlayFromCurrent && this.currentBaseAnimInfo ) {
			this.currentBaseAnimInfo.forcePlaythrough = false;
		}
	}

	// We differentiate between a "base" animation and a "mixin" animation.
	// Only one base animation can be active at a time. Multiple enqueued
	// base animations will play sequentially (with or without a cross
	// fade). A mixin animation will run in parallel with the current base
	// animation, but will not influence the sequential timings of the
	// queued base animations. Multiple mixin animations can be active
	// simultaneously.
	/**
	 *	@param {number} [startDelta=0] - The difference between the time
	 *	the new animation should have started, and the current
	 *	AnimationMixer's time. This is provided by update() because it
	 *	won't get called exactly at the "startNextTime".
	 */
	_playNextAnim(startDelta=0) {
		if ( this.animQueue.length <= 0 ) {
 			console.debug("No more animations left to play.");
			return;
		}
		// Pop the first animation information object from the queue.
		const info = this.animQueue.shift();
		const clip = this.animClips[info["name"]];
		if ( !clip ) {
			console.warn(`Can't play unknown animation: ${info.name}`);
			return this._playNextAnim();
		}

		let isMixin = info["isMixin"] || false;

		const altRoot = info["altRoot"] || null;
		if ( altRoot && !isMixin ) {
			console.warn("Animation with altRoot can't be base animation. Forcing mixin.");
			isMixin = true;
		}

		const action = this.animMxr.clipAction(clip, altRoot);
		if ( !action ) {
			console.error(`Failed to get AnimationAction for: ${info.name}`);
			return this._playNextAnim();
		}
		// Reset the action.
		// Note: This will also reset the action's time and _starTime.
		// So it needs to be called before we update those again based
		// on the animation info properties.
		action.reset();

		const delay = info["delay"] || 0;
		if ( delay > 0 || startDelta > 0 ) {
			// Note: If a `startDelta` was provided we need to
			// subtract it, since it denotes the time that the
			// animation should have already been running. (I.e.
			// this will (or should) skip the animation to the
			// correct playback time.)
			action.startAt(this.animMxr.time + delay - startDelta);
		}

		let fadeTime = info["fadeTime"];
		if ( fadeTime != null ) {
			fadeTime = Math.max(0, fadeTime);
		} else {
			fadeTime = this.defaultFadeTime;
		}
// TODO >>> Should we take the `startDelta` into account for the `fadeTime`?
// TODO --- I.e. do we prefer a smooth faded animation, or correct timing with
// TODO --- a squeezed `fadeTime`?
//		// Adjust the fade time accroding to any `startDelta`.
//		fadeTime -= startDelta;
// TODO <<<

		// If there's a fade time, then we should fade in or cross
		// fade the animation.
		if ( fadeTime > 0 ) {
			// If the animation is a mixin, or when there was no
			// previous animation, then we just fade in the
			// animation.
			if ( isMixin || !this.currentBaseAnimInfo ) {
				action.fadeIn(fadeTime);
				// Also fade out the animation if it's being
				// mixed in. Otherwise the already playing
				// animation might "glitch" because this
				// animation would finish "abruptly".
				if ( isMixin && this.currentBaseAnimInfo ) {
// TODO >>> If stopAll() is called, then this timeout will still get triggered.
					window.setTimeout(() => {
						action.fadeOut(fadeTime);
					}, Math.max(clip.duration + delay - fadeTime, 0) * 1000); 
// TODO <<<
				}
			} else {
// TODO >>> Currently we cross-fade even when using an altRoot. Is this ok?
// TODO --- And is it ok to update currentBaseAnimInfo (at the end) in this
// TODO --- case? Because it seems somewhat inconsistent.
				// Cross-fade the new animation with any
				// currently playing animation.
				action.crossFadeFrom(this.currentBaseAnimInfo.action, fadeTime);
// TODO <<<
			}
		}

		const clamp = info["clamp"] || false;
		if ( clamp ) {
			action.clampWhenFinished = true;
		} else {
			action.clampWhenFinished = false; // The default.
		}

		let loop = info["loop"] ? THREE.LoopRepeat : THREE.LoopOnce;
// TODO >>> What if the first animation is a looping one and all others are
// TODO --- "mixed" in animations? Or what if the last animation uses an
// TODO --- alternative root?
		// If there are still other animations queued then this one
		// isn't allowed to loop forever.
		if ( loop != THREE.LoopOnce && this.animQueue.length > 0 ) {
			// IMPLEMENT - Check if there is any other base
			// animation, if not, then just keep this one as a
			// looping one.
			console.debug("Forcing LoopOnce");
			loop = THREE.LoopOnce;
		}
// TODO <<<
		action.setLoop(loop);

		const reverse = info["reverse"] || false;
		if ( reverse ) {
			action.timeScale = -1;
			// Make sure the animation starts from the end (for
			// LoopOnce animations this is required because
			// otherwise the animation will be already at the end (
			// i.e. time 0 for reverse animations).
			action.time = clip.duration;
		} else {
			// Actions are cached, so make sure the animation plays
			// forward if it was previously set to play in reverse
			// but now it's no the case anymore.
			// Note: reset() will have set the action's time to 0.
			action.timeScale = 1;
		}

		let forcePlaythrough = info["forcePlaythrough"] || false;
		// Only allow forcing full playthrough of non-looping base
		// animations.
		if ( loop != THREE.LoopOnce || isMixin ) {
			forcePlaythrough = false;
		}

		console.debug(`[ANIM] ${info.name} - fadeTime: ${fadeTime}, clamp: ${clamp}, isMixin: ${isMixin}, delay: ${delay}, loop: ${loop}, reverse: ${reverse}, forced: ${forcePlaythrough}, altRoot: ${altRoot}`);

		const disableAnims = info["disableAnims"] || null;
		if ( Array.isArray(disableAnims) ) {
			disableAnims.forEach((el) => {
				const tmpClip = this.animClips[el];
				if ( tmpClip ) {
					this.animMxr.clipAction(tmpClip, altRoot).enabled = false;
					console.debug(`Disabled ${el}`);
				}
			});
		}

		action.play();

		// Call the animation's callback if one was assigned.
		let callback = info["callback"] || null;
		if ( callback ) {
			callback(info["name"]);
		}

		// If this is a mixin animation the only thing we need to do
		// is play it and  then continue on to the next animation.
		if ( isMixin ) {
			// Note: For mixin animations we forward the
			// `startDelta` so the next base animation will be able
			// to take it into account.
			return this._playNextAnim(startDelta);
		}

		let endTime = null;
		let startNextTime = null;
		// There will only be an "endTime" (and consequently a
		// "startNextTime") when the new animation won't be looping.
		if ( loop == THREE.LoopOnce ) {
			endTime = this.animMxr.time + clip.duration + delay - startDelta;
			const nextBaseAnim = this._findNextBaseAnim();
			if ( nextBaseAnim ) {
				startNextTime = endTime;
				let fadeTime = nextBaseAnim["fadeTime"];
				if ( fadeTime != null ) {
					fadeTime = Math.max(0, fadeTime);
				} else {
					fadeTime = this.defaultFadeTime;
				}

				// If the next base animation uses a (default)
				// fade time, then the next animation should
				// start `fadeTime` earlier then the `endTime`
				// of the current animation.
				startNextTime -= fadeTime;
			}
		}

		this.currentBaseAnimInfo = {
			action,
			endTime,
			startNextTime,
			forcePlaythrough
		};
	}

	/**	Looks for the next base animation in the current queue.
	 *
	 *	@returns {Object} - The animation info object for the next
	 *	base animation in the queue; or <code>null</code> if there is
	 *	none.
	 */
	_findNextBaseAnim() {
		if ( this.animQueue.length > 0 ) {
			for ( const info of this.animQueue ) {
				if ( info["isMixin"] ) {
					continue;
				}
				return info;
			}
		}

		return null;
	}

	/**	Updates the underlying AnimationMixer.
	 *	@param {number} delta - The delta time (in seconds).
	 */
	update(delta) {
		// If there is a currently playing (or planned) base animation,
		// then check if it's near its end and if we need to start the
		// next one.
		if ( this.currentBaseAnimInfo ) {
			// Note: We have to add `delta` here, since we update
			// the AnimationMixer (and thus its time) after this
			// code. Otherwise the `animTime` would reflect the old
			// AnimationMixer time, and thus be one update() out of
			// sync. Also see the comment at animMxr.update() below.
			const animTime = this.animMxr.time + delta;
			const { endTime, startNextTime } = this.currentBaseAnimInfo;
			// Note: If there is no `endTime` then there will also
			// not be a `startNextTime`.
			if ( endTime ) {
				// If we've reached the end of the current
				// animation, then reset `currentBaseAnimInfo`.
				// Note: If there are still other base
				// animations queued, then they won't have an
				// "current" animation to cross fade from. But
				// since the current animation finished (it has
				// reached its end), cross fading wouldn't have
				// been possible anymore anyway.
				if ( endTime <= animTime ) {
					console.debug("Resetting baseAnimInfo");
					this.currentBaseAnimInfo = null;
				}
				// If there is a `startNextTime` (and it has
				// been reached), it means another animation
				// was queued and we should start it now.
				// Note: `startNextTime` will never be later
				// than `endTime`.
				if ( startNextTime && startNextTime <= animTime ) {
					const startDelta = animTime - startNextTime;
					console.debug(`Starting next animation (delta: ${startDelta})`);
					this._playNextAnim(startDelta);
				}
			}
		}

		// Update the animation mixer.
		// Note: We need to do this after we (potentially) start any
		// new animations with _playNextAnim() in the code above.
		// Because any AnimationAction.play() we call in _playNextAnim()
		// will only have an effect starting from the next update() of
		// the AnimationMixer.
		// So if the next animation would have a zero fade time, then
		// the previous animation would be stopped by the
		// AnimationMixer.update() in the current frame, while the new
		// animation would only start to take effect in the next frame's
		// AnimationMixer.update(). This means there would be a one
		// frame gap between the previous animation ending and the new
		// one starting.
		// Because the model would revert to its default stance (if
		// there are no other animations currently active) during this
		// one frame "gap", there would be a visible glitch.
		this.animMxr.update(delta);
	}

	/**	Stops all animations and clears the queue.
	 */
	stopAll() {
		if ( this.timerId ) {
			window.clearTimeout(this.timerId);
			this.timerId = 0;
		}
		this.animMxr.stopAllAction();
		this.currentBaseAnimInfo = null;
		this.animQueue = [];
	}

	/**	Gets the original AnimationClip object associated with the given
	 *	name.
	 *
	 *	@param {string} name - The name of the AnimationClip to return.
	 *	@returns {THREE.AnimationClip} The animation clip if it exists.
	 */
	getAnimClip(name) {
		return this.animClips[name];
	}

	/**	Get total duration of the currently queued base animations.
	 *
	 *	@param {boolean} [whenPurged=false] - If set to
	 *	<code>true</code>, then the total duration will be calculated
	 *	as if the current queue would be purged (i.e. only base
	 *	animations with their <code>forcePlaythrough</code> set will be
	 *	taken into account).
	 *	@returns {number} - The total time (in seconds) of queued
	 *	animations.
	 */
	getTotalQueueBaseTime(whenPurged=false) {
		let totalTime = 0;
		if ( this.currentBaseAnimInfo ) {
			if ( !this.currentBaseAnimInfo.endTime ) {
				// If the current animation is a looping one
				// it will currently play forever.
				return 0;
			} else if ( this.currentBaseAnimInfo.startTime ) {

				if ( whenPurged && !this.currentBaseAnimInfo.forcePlaythrough ) {
					totalTime = 0;
				} else {
					totalTime = this.currentBaseAnimInfo.startNextTime - this.animMxr.time;
				}
			} else {
				// The current animation is not a looping one,
				// but there aren't any more animations queued.
				if ( !whenPurged || this.currentBaseAnimInfo.forcePlaythrough ) {
					return this.currentBaseAnimInfo.endTime - this.animMxr.time;
				} else {
					return 0;
				}
			}
		} else {
			// If there is no current animation, then there also
			// aren't any queued animations.
			// DEBUG >>>
			if ( this.animQueue.length > 0 ) {
				console.warn(`No current animation while still ${this.animQueue.length} animations are queued.`);
			}
			// DEBUG <<<
			return 0;
		}

		for ( let i = 0; i < this.animQueue.length; ++i ) {
			const info = this.animQueue[i];
			// Don't take into account mixin animations (which
			// includes "altRoot" animations). And also don't take
			// into account a loop animation (if it's the last one
			// in the queue, since others will be forced to
			// non-looping).
			// If `whenPurged` was used then also skip any animation
			// that doesn't have the `forcePlaythrough` flag set.
			if ( info["isMixin"] || info["altRoot"] || (info["loop"] && i == this.animQueue.length - 1) || (whenPurged && !info["forcePlaythrough"]) ) {
				continue;
			}

			// Add any delay.
			totalTime += info["delay"] || 0;
			// Subtract the fadeTime (because the animation will
			// play earlier because of it).
			let fadeTime = info["fadeTime"];
			if ( fadeTime != null ) {
				fadeTime = Math.max(0, fadeTime);
			} else {
				fadeTime = this.defaultFadeTime;
			}
			totalTime -= fadeTime;
			// And add the clip's duration.
			const clip = this.animClips[info.name];
			if ( clip ) {
				totalTime += clip.duration;
			}
		}

		return totalTime;
	}
}

