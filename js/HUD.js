/**	A HUD that positions its elements fixed relative to the camera.
 */
class HUD {
	/**	@param {THREE.Scene} scene
	 */
	constructor(scene) {
		this.scene = scene;

		this.HUDObjects = [];
	}

	/**	Creates a new UI element and adds it to the HUDObjects list.
	 *
	 *	@param {number} relativeLeft - The x-position of the UI
	 *	element's center relative to the left side of the camera's
	 *	viewport.
	 *	@param {number} relativeTop - The y-position of the UI element's
	 *	center relative to the top side of the camera's viewport.
	 *	@param {string} action - The action to associate with the UI
	 *	element.
	 *	@param {hex or string} color - The base color to use for the UI
	 *	element.
	 *	@param {number} [width=0.15] - The width of the UI element. The
	 *	value should represent the fraction of the screen width, so in
	 *	the range (0, 1]. If not provided, and no height is provided
	 *	either, then the default width will be 0.15. If a height is
	 *	provided, then the width will be calculated based on the height,
	 *	such that the resulting UI element is square.
	 *	@param {number} [height] - The height of the UI element. The
	 *	value should represent the fraction of the screen height, so in
	 *	the range (0, 1]. If not provided, then the height will be
	 *	calculated as: <code>width * aspect</code> (resulting in a
	 *	square element).
	 *	@param {string} textureName - (optional) The name of the texture
	 *	to apply to the UI element's mesh. The TextureMgr is used to
	 *	retrieve the texture associated with this name. So the texture
	 *	should have been loaded in the TextureMgr upfront.
	 *	@param {boolean} isTransparent - (optional) If set to `true`,
	 *	then the `transparent` property of the element's material will
	 *	also be set to true. Default is `true`.
	 */
	addUIElement(relativeLeft, relativeTop, action, color, width, height, textureName, isTransparent) {
		// Clamp to the [0, 1] range.
		relativeLeft = Math.min(Math.max(relativeLeft, 0.0), 1.0);
		relativeTop = Math.min(Math.max(relativeTop, 0.0), 1.0);
		action = action || "noop";
		if ( isTransparent == null ) {
			isTransparent = true;
		}
		const g = new THREE.PlaneBufferGeometry(1, 1, 1, 1);
		const m = new THREE.MeshBasicMaterial({ color: color });
		m.color.convertSRGBToLinear();
		if ( textureName ) {
			if ( g_texMgr ) {
				const tex = g_texMgr.getTexture(textureName);
				if ( tex ) {
					m.map = tex;
					// Note: If the textures contain
					// transparent parts, then we should set
					// the `transparent `property to `true`.
					m.transparent = isTransparent;
				} else {
					console.error(`Couldn't retrieve texture with name ${textureName} from TextureMgr.`);
				}
			} else {
				console.error("Can't load texture without TextureMgr.");
			}
		}
		const mesh = new THREE.Mesh(g, m);

		// Assign a (camera) relative location for the button.
		// Location format is [<left>, <top>]. Values are percentages
		// of the size, defined as a value in the range 0.0 and 1.0.
		mesh.userData.relLoc = [relativeLeft, relativeTop];
		// Also assign an action. This will be the action used in the
		// emitted "click" event.
		mesh.userData.uiAction = action;
		mesh.userData.disabled = false;
		mesh.userData.width = width;
		mesh.userData.height = height;
		mesh.userData.calculatedWH = false;
		this.HUDObjects.push(mesh);
		this.scene.add(mesh);
	}

	/**	Should be called each frame to update the location of the HUD
	 *	elements.
	 *
	 *	Positioning inspired by https://stackoverflow.com/a/34866778
	 *
	 *	@param {THREE.Camera} camera - The camera used to unproject()
	 *	the UI elements relative to the camera's view.
	 */
	update(camera) {
		// Note: A depth of -1.0 should place the object at the near
		// plane of the camera.
		// Note: unproject() relies on the camera's
		// `projectionMatrixInverse` and `matrixWorld`.
		for ( const obj of this.HUDObjects ) {
			if ( !obj.userData.calculatedWH ) {
				// Calculate (default) width and/or height if
				// they weren't provided. We try to achieve a
				// square size (which means we need to take the
				// camera/screen aspect ratio into account.
				if ( !obj.userData.width && ! obj.userData.height ) {
					obj.userData.width = 0.15;
					obj.userData.height = 0.15 * camera.aspect;
				} else if ( !obj.userData.width ) {
					obj.userData.width = obj.userData.height / camera.aspect;
				} else if ( !obj.userData.height) {
					obj.userData.height = obj.userData.width * camera.aspect;
				}
				// Calculate the factor with which we should
				// scale the mesh of the UI element in the
				// camera/world space to based on the requested
				// screen space relative size.
				// Note: Since the projection space goes from
				// -1 to +1 and the width/height goes from
				// 0 to +1, we need to double their value.
				const s = new THREE.Vector3(obj.userData.width * 2, obj.userData.height * 2, -0.99);
				// Note: The same as `.unproject()` but without
				// `matrixWorld` step (as it's not needed).
				s.applyMatrix4(camera.projectionMatrixInverse);
				obj.scale.x = s.x;
				obj.scale.y = s.y;
				obj.userData.calculatedWH = true;
			}
			obj.position.set(-1 + 2 * obj.userData.relLoc[0], 1 - 2 * obj.userData.relLoc[1], -0.99).unproject(camera);
			obj.quaternion.setFromRotationMatrix(camera.matrixWorld);
		}
	}

	dispose() {
		for ( const obj of this.HUDObjects ) {
			obj.geometry.dispose();
			obj.material.dispose();
		}
		// "Clear" the array.
		this.HUDObjects.length = 0;
	}

	getObjectsForRaycasting() {
		// Note: We still include UI element that were disabled. Because
		// if a disabled element is clicked, we still want it to
		// register as a virtual hit. To be able to prevent the AR
		// hittest ray to be fired "through" the disabled UI element.
		return this.HUDObjects.filter(obj => obj.visible);
	}

	/**	Hides the UI element associated with the specified action.
	 *	@param {string} name - The action name of the UI element to
	 *	hide.
	 *	@param {number} delay - (optional) Delay (in seconds) after
	 *	which the element will be hidden. Default: 0.
	 */
	hideAction(name, delay) {
		if ( delay == null ) {
			delay = 0;
		}
		// TODO Should we store the UI elements in a dictionary instead
		// of an array?
		for ( const uiElem of this.HUDObjects ) {
			if ( uiElem.userData.uiAction == name ) {
				if ( uiElem.userData.hideShowDelayTimeoutId != null ) {
					window.clearTimeout(uiElem.userData.hideShowDelayTimeoutId);
					uiElem.userData.hideShowDelayTimeoutId = null;
				}
				if ( delay > 0 ) {
					uiElem.userData.hideShowDelayTimeoutId = window.setTimeout((elem, hud) => {
						hud.hideAction(elem.userData.uiAction, 0);

					}, delay * 1000, uiElem, this);
				} else {
					uiElem.visible = false;
				}
				break;
			}
		}
	}

	/**	Makes a previously hidden UI element visible again.
	 *	@param {string} name - The action name of the UI element to
	 *	show again.
	 *	@param {number} delay - (optional) Delay (in seconds) after
	 *	which the element will be shown. Default: 0.
	 */
	showAction(name, delay) {
		if ( delay == null ) {
			delay = 0;
		}
		for ( const uiElem of this.HUDObjects ) {
			if ( uiElem.userData.uiAction == name ) {
				if ( uiElem.userData.hideShowDelayTimeoutId != null ) {
					window.clearTimeout(uiElem.userData.hideShowDelayTimeoutId);
					uiElem.userData.hideShowDelayTimeoutId = null;
				}
				if ( delay > 0 ) {
					uiElem.userData.hideShowDelayTimeoutId = window.setTimeout((elem, hud) => {
						hud.showAction(elem.userData.uiAction, 0);
					}, delay * 1000, uiElem, this);
				} else {
					uiElem.visible = true;
				}
				break;
			}
		}
	}

	/**	Disables the specified action.
	 *
	 *	This will reduce the element's opacity, and will also no longer
	 *	include it in the list of objects used for ray casting against.
	 *	@param {string} name - Then name of the action to disable.
	 *	@param {number} delay - (optional) Delay (in seconds) after
	 *	which the element will be disabled. Default: 0.
	 */
	disableAction(name, delay) {
		if ( delay == null ) {
			delay = 0;
		}
		for ( const uiElem of this.HUDObjects ) {
			if ( uiElem.userData.uiAction == name ) {
				if ( uiElem.userData.disEnableDelayTimeoutId != null ) {
					window.clearTimeout(uiElem.userData.disEnableDelayTimeoutId);
					uiElem.userData.disEnableDelayTimeoutId = null;
				}
				if ( delay > 0 ) {
					uiElem.userData.disEnableDelayTimeoutId = window.setTimeout((elem, hud) => {
						hud.disableAction(elem.userData.uiAction, 0)
					}, delay * 1000, uiElem, this);
				} else {
					uiElem.material.opacity = 0.25;
					uiElem.userData.disabled = true;
				}
				break;
			}
		}
	}

	/**	Enables the specified action.
	 *
	 *	This will restore the element's opacity to 1, and will take it
	 *	into account again when ray casting.
	 *	@param {string} name - Then name of the action to enable.
	 *	@param {number} delay - (optional) Delay (in seconds) after
	 *	which the element will be enabled. Default: 0.
	 */
	enableAction(name, delay) {
		if ( delay == null ) {
			delay = 0;
		}
		for ( const uiElem of this.HUDObjects ) {
			if ( uiElem.userData.uiAction == name ) {
				if ( uiElem.userData.disEnableDelayTimeoutId != null ) {
					window.clearTimeout(uiElem.userData.disEnableDelayTimeoutId);
					uiElem.userData.disEnableDelayTimeoutId = null;
				}
				if ( delay > 0 ) {
					uiElem.userData.disEnableDelayTimeoutId = window.setTimeout((elem, hud) => {
						hud.enableAction(elem.userData.uiAction, 0)
					}, delay * 1000, uiElem, this);
				} else {
					uiElem.material.opacity = 1.0;
					uiElem.userData.disabled = false;
				}
				break;
			}
		}
	}

	/**	Associates a callback with an action.
	 *
	 *	This will assign the provided function as the uiCallback
	 *	property of this actions userData.
	 *	@param {string} name - Then name of the action to assign the
	 *	callback to.
	 *	@param {function} callback - The function to assign as the
	 *	callback. When called the function will receive on parameter:
	 *	its action's name.
	 */
	setActionCallback(name, callback) {
		for ( const uiElem of this.HUDObjects ) {
			if ( uiElem.userData.uiAction == name ) {
				uiElem.userData.uiCallback = callback;
				break;
			}
		}
	}
}

