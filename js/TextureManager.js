class TextureManager {
	constructor() {
		this.texLoader = new THREE.TextureLoader();
		this.texMap = {};
	}

	/**
	 *	Note that if there was already a texture for the `name` then
	 *	that texture will be replaced in the TextureMgr's internal map.
	 *	But the previous texture will not be disposed of. Also any
	 *	materials that were using the old texture, will keep on using
	 *	it.
	 *	@param {string} name - A name that is used to store the texture
	 *	in an internal map. This name can then also be used later to
	 *	retrieve the texture again after it was loaded.
	 *	@param {string} src - The source url of the texture file to
	 *	load.
	 *	@param {number} textureEncoding - (Optional) The texture
	 *	encoding that should be applied to this texture. By default the
	 *	THREE.sRGBEncoding will be assigned (note that this is different
	 *	form three.js's default of THREE.LinearEncoding).
	 *	@returns {Promise} A Promise that will resolve to the three.js
	 *	Texture if loaded successfully.
	 */
	loadTexture(name, src, textureEncoding) {
		return new Promise((resolve, reject) => {
			if ( !name || !src ) {
				reject(new Error("Invalid parameters"));
				return;
			}

			this.texLoader.load(src, (texture) => {
				this.texMap[name] = texture;
				texture.encoding = textureEncoding || THREE.sRGBEncoding;
				resolve(texture);
			}, null, (err) => {
				reject(new Error(`Failed to load ${err.currentTarget.src}`));
			});
		});
	}

	/**	@returns {THREE.Texture|undefined} The texture associated with
	 *	the given name. If no texture was previously loaded for this
	 *	`name` then `undefined` is returned instead.
	 */
	getTexture(name) {
		return this.texMap[name];
	}

	/**	Disposes of all Textures in the internal map.
	 *
	 *	Note that this won't make any changes to any materials that
	 *	might still be using these textures.
	 */
	disposeAll() {
		for ( let [key, value] of Object.entries(this.texMap) ) {
			value.dispose();
			this.texMap[key] = null;
		}
		// "Clear" the texture map.
		this.texMap = {};
	}
}

