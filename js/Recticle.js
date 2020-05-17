/**	HitTest state changed event.
 *
 *	@event Recticle#hitteststatechanged
 *	@type {object}
 *	@property {string} state - The new HitTest state.
 *	@property {string} oldState - The previous HitTest state.
 *
 *	The state values can be one of the Recticle.HitTestStates values, i.e.
 *	DISABLED, UNSTABLE, STABLE.
 *	A recticle will always start in a "disabled" state. Once a
 *	XRHitTestSource has been successfully created, its state will update to
 *	"unstable". When the hit testing actually returns a hit point, the state
 *	will change to "stable". If for some reason tracking is lost and no
 *	correct hit points can be determined, the state will change back to
 *	"unstable". Once tracking resumes, it changes back to "stable" and so
 *	on. If the Recticle is disable()-ed, then its state will also be changed
 *	to "disabled" again. Calling enable() afterwards will start the
 *	XRHitTestSource method, which will also reinitialize the state to
 *	"unstable".
 */
/**
 *	@fires Recticle#hitteststatechanged
 */
class Recticle extends EventTarget {
	/**
	 *	@param {XRSession} session - The session that is used to create
	 *	the XRHitTestSource (which will use a "viewer"
	 *	XRReferenceSpace).
	 *	@param {XRReferenceSpace} xrRefSpace - The reference place into
	 *	which to place the recticle. I.e. the hit location will be
	 *	mapped from the recticle's "viewer" reference space to this
	 *	reference space.
	 *	@param {THREE.Scene} scene
	 *	@param {THREE.Camera} camera
	 *	@param {THREE.Object3D} mesh - (optional) Mesh to use instead of
	 *	the default ring mesh. Note: The provided mesh will be added to
	 *	scene by this class, and will also be disposed of when the class
	 *	is dispose()-ed.
	 */
	constructor(session, refSpace, scene, camera, mesh) {
		// Call EventTarget's constructor.
		super();
		this._hitteststate = Recticle.HitTestStates.DISABLED;

		this.session = session;
		this.refSpace = refSpace;
		this.scene = scene;
		this.camera = camera;

		this.mesh = null;
		this._debug = false;
		this._dbgLine = null;
		this._dbgGizmo = null;
		this._viewerHitTestSource = null;

		//this._rayCaster = null;

		this.init(mesh);
	}

	get hitteststate() {
		return this._hitteststate;
	}
	set hitteststate(state) {
		if ( state != this._hitteststate ) {
			this.dispatchEvent(new CustomEvent("hitteststatechange", { detail: { state: state, oldstate: this._hitteststate } }));
			this._hitteststate = state;
		}
	}

	set debug(value) {
		this._debug = value;
		// Note: Only when we're in the STABLE state can the _dbgGizmo's
		// visibility be true.
		if ( this._dbgGizmo && this._hitteststate == Recticle.HitTestStates.STABLE ) {
			this._dbgGizmo.visible = value;
		}
		if ( this._dbgLine ) {
			this._dbgLine.visible = value;
		}
	}

	init(mesh) {
		if ( this.mesh == null ) {
			if ( mesh ) {
				this.mesh = mesh;
			} else {
				// Create a recticle. Based on https://github.com/googlecodelabs/ar-with-webxr/blob/master/shared/utils.js
				let g = new THREE.RingGeometry(0.1, 0.11, 6, 1);
				// Rotate the ring so its horizontal.
				g.rotateX(-Math.PI / 2);
				let m = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
				m.color.convertSRGBToLinear();
				this.mesh = new THREE.Mesh(g, m);
			}
			this.mesh.visible = false;
			// Add the recticle to the scene.
			this.scene.add(this.mesh);
		}

		if ( this._dbgLine == null ) {
			let g = new THREE.Geometry();
			g.vertices.push(new THREE.Vector3(-0.01, 0, 0));
			g.vertices.push(new THREE.Vector3(0, 0, -1));
			g.vertices.push(new THREE.Vector3(0.01, 0, 0));
			let m = new THREE.LineBasicMaterial({color: 0xFF00FF});
			m.color.convertSRGBToLinear();
			this._dbgLine = new THREE.Line(g, m);
			this._dbgLine.visible = this._debug;
			this.scene.add(this._dbgLine);
		}

		if ( this._dbgGizmo == null ) {
			this._dbgGizmo = new THREE.AxesHelper(0.2);
			this._dbgGizmo.visible = false;
			this.scene.add(this._dbgGizmo);
		}
	}

	async enable() {
		// If we already have a HitTestSource, then we're already
		// enabled.
		if ( this._viewerHitTestSource ) {
			return;
		}

		// Try to get a XRHitTestSource for a "viewer" XRReferenceSpace.
		if ( !this.session ) {
			throw new Error("No XRSession available.");
		}

		// Initialize hit testing by requesting an XRHitTestSource.
		// Because we want the rays for this XRHitTestSource to
		// originate from the center of the screen, we need to create a
		// new viewer XRReferenceSpace that we can use for the
		// XRHitTestSource.
		// Note that this viewer reference space should more or less
		// coincide with our camera position.
		const viewerRefSpace = await this.session.requestReferenceSpace("viewer");
		const hitTestOptionsInit = {
			space: viewerRefSpace,
			//,offsetRay: new XRRay({y: 0.5}),
			// Should we also include "point"?
			entityTypes: ["plane"]//"plane"=default
		};
		// "Subscribe" to a XRHitTestSource that is linked to the
		// viewer XRReferenceSpace we just requested.
		this._viewerHitTestSource = await this.session.requestHitTestSource(hitTestOptionsInit);
		// Store the init options as extra data so we can access the
		// viewer space.
		this._viewerHitTestSource.appContext = {
			options: hitTestOptionsInit
		};

		// "Unhide" the debug line (if needed). Note that the mesh and
		// gizmo will be made visible again by the update() method.
		this._dbgLine.visible = this._debug;

		this.hitteststate = Recticle.HitTestStates.UNSTABLE;
	}

	disable() {
		// Cancel our "subscription" to the viewer hittest source.
		if ( this._viewerHitTestSource ) {
			// FIXME For some reason Chrome 79 exposes the
			// XRHitTestSource API, but without a cancel() method.
			// For now we just skip the cancel. But this might cause
			// the XRHitTestSource to remain active while a new call
			// to enable() will create a new one.
			if ( !this._viewerHitTestSource.cancel ) {
				console.warn("XRHitTestSource has no cancel()!");
			} else {
				this._viewerHitTestSource.cancel();
			}
			this._viewerHitTestSource = null;
		}

		this.hitteststate = Recticle.HitTestStates.DISABLED;

		// "Hide" the recticle related objects.
		this.mesh.visible = false;
		this._dbgLine.visible = false;
		this._dbgGizmo.visible = false;
	}

	async update(xrFrame) {
		if ( !this._viewerHitTestSource ) {
			return;
		}

		/*
		this._rayCaster = this._rayCaster || new THREE.Raycaster();

		// Note: Relies on the camera's `matrixWorld` and
		// `projectionMatrixInverse` matrices.
		this._rayCaster.setFromCamera({ x: 0, y: 0 }, this.camera);
		const ray = this._rayCaster.ray;
		const xrRay = new XRRay(ray.origin, ray.direction);
		const hits = await this.session.requestHitTest(xrRay, this.refSpace);
		*/
		// TODO If there are multiple views, then this update() function
		// will now also get called multiple times. This will cause
		// multiple hitTests to be performed, which makes no sense since
		// the "viewer" reference frame doesn't change inbetween views.
		// So maybe keep track of the previous xrFrame? And if it's
		// still the same, just skip the hitTest stuff? Only the
		// _dbgLine stuff is camera dependent, and thus should be
		// updated for each view.
		let gotHitTest = false;
		const hits = xrFrame.getHitTestResults(this._viewerHitTestSource);
		if ( hits && hits.length > 0 ) {
			/*
			const hit = hits[0];
			const hitMatrix = new THREE.Matrix4().fromArray(hit.hitMatrix);
			this.mesh.position.setFromMatrixPosition(hitMatrix);
			this.mesh.visible = true;
			*/

			const hit = hits[0];
			// Get the hit position in the g_xrRefSpace.
			// Note that the XRHitTestResult is relative to our
			// "viewer" XRReferenceSpace with which the
			// XRHitTestSource was initialized. So we need to map
			// the hit's pose from that reference space to the
			// global "local" XRReferenceSpace.
			const hitPose = hit.getPose(this.refSpace);
			// If the relation between the "viewer" and
			// `this.refSpace`, for some reason, can't currently be
			// resolved, then `getPose()` will return `null`.
			if ( hitPose ) {
				// Mark that a hitTest was successful.
				gotHitTest = true;

				const hitMatrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
				this.mesh.position.setFromMatrixPosition(hitMatrix);
				// Set the dbgGizmo postion, rotation and scale
				// according to the hitMatrix.
				hitMatrix.decompose(this._dbgGizmo.position, this._dbgGizmo.quaternion, this._dbgGizmo.scale);
			}
		}

		this.mesh.visible = gotHitTest;
		// Note: Only make _dbgGizmo visible when debuggin is enabled.
		this._dbgGizmo.visible = gotHitTest && this._debug;
		this.hitteststate = gotHitTest ? Recticle.HitTestStates.STABLE : Recticle.HitTestStates.UNSTABLE;

		// DEBUG ->
		// Update the debug line's pose based on the camera's matrix.
		// Note: We only set the camera's matrices, not its `position`
		// etc.
		this.camera.matrix.decompose(this._dbgLine.position, this._dbgLine.quaternion, this._dbgLine.scale);
		// DEBUG <-
	}

	dispose() {
		this.disable();

		this.scene.remove(this.mesh);
		this.mesh.material.dispose();
		this.mesh.geometry.dispose();
		this.mesh = null;

		this.scene.remove(this._dbgLine);
		this._dbgLine.material.dispose();
		this._dbgLine.geometry.dispose();
		this._dbgLine = null;

		this.scene.remove(this._dbgGizmo);
		this._dbgGizmo.material.dispose();
		this._dbgGizmo.geometry.dispose();
		this._dbgGizmo = null;
	}

	/**
	 *	@returns {null or THREE.Vector3} The position of the recticle if
	 *	it's currently "stable" (i.e. hit positions can be requested).
	 *	Otherwise <code>null</code> is returned.
	 */
	getPosition() {
		// TODO Can we use something better than the visible property
		// to determine when the recticle is "stable" and thus when it
		// has an up-to-date HitTest position.
		if ( this.mesh.visible ) {
			// TODO Do we need to clone?
			return this.mesh.position.clone();
		} else {
			return null;
		}
	}

	get isStable() {
		return this.hitteststate == Recticle.HitTestStates.STABLE;
	}
}
/**	An "enum" for the HitTest states.
 */
Recticle.HitTestStates = Object.freeze({
	DISABLED: "disabled",
	UNSTABLE: "unstable",
	STABLE: "stable"
});

