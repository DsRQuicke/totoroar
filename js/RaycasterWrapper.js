/**	A simple Raycast class that wraps a THREE.Raycaster.
 *
 *	The class offers some debug objects, to visualize the position and
 *	direction of the cast ray.
 *	The castRay() method will internally just call intersectObjects() of
 *	the THREE.Raycaster.
 */
class RaycasterWrapper {
	/**	@param {THREE.Scene} scene
	 */
	constructor(scene) {
		this.scene = scene;
		this.raycaster = new THREE.Raycaster();
		this._prevPoseData = null;

		this._debug = false;
		this._dbgGizmo = new THREE.AxesHelper(0.1);
		this._dbgGizmo.visible = false;
		this.scene.add(this._dbgGizmo);
		this._dbgArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 0), 0.25, 0x00FFFF);
		this._dbgArrow.visible = false;
		this.scene.add(this._dbgArrow);
	}

	set debug(value) {
		this._debug = value;
		// Only make the debug objects visible when a ray was previously
		// casted. Otherwise the debug objects will show up at the
		// origin.
		if ( value && this._prevPoseData ) {
			this._dbgGizmo.visible = true;
			this._dbgArrow.visible = true;
		} else {
			this._dbgGizmo.visible = false;
			this._dbgArrow.visible = false;
		}
	}

	dispose() {
		this.scene.remove(this._dbgGizmo);
		this._dbgGizmo.geometry.dispose();
		this._dbgGizmo.material.dispose();
		this._dbgGizmo = null;
		this.scene.remove(this._dbgArrow);
		// ArrowHelper consists of two sub meshes, so we can't just call
		// geometry and material .dispose() on it.
		this._dbgArrow.line.geometry.dispose();
		this._dbgArrow.line.material.dispose();
		this._dbgArrow.cone.geometry.dispose();
		this._dbgArrow.cone.material.dispose();
		this._dbgArrow = null;

		this.scene = null;
		this.raycaster = null;
		this._prevPoseData = null;
	}

	/**	Run an intersection test using a ray based on the provided
	 *	XRPose. Aside from the xrPose parameter, the parameters are
	 *	the same as those of THREE.Raycaster::intersectObjects().
	 *
	 *	@param {XRPose} xrPose - The pose from which to shoot the ray.
	 *	@param {Array.<THREE.Object3D>} objects - A list of object to
	 *	check for intersection with the ray.
	 *	@param {boolean} recursive - (optional) if set to true then the
	 *	raycaster will also check descendants of the objects. Default:
	 *	false.
	 *	@param {Array.<object>} optionalTarget - (optional) If provided,
	 *	then any hits will be added to this array. Otherwise a new array
	 *	is created.
	 *	@returns {Array.<object>} A list of three.js hit objects. The
	 *	array will be empty if there were no intersection hit.
	 */
	castRay(xrPose, objects, recursive, optionalTarget) {
		if ( !this._prevPoseData && this._debug ) {
			// If debug is enabled, and this is the first call to
			// castRay(), then the debug objects will still be
			// hidden. So make them visible now.
			this._dbgGizmo.visible = true;
			this._dbgArrow.visible = true;
		}
		// Only recalculate the position etc. when the pose changed.
		if ( !this._prevPoseData || this._prevPoseData.xrPose != xrPose ) {
			// Cast the ray from the (input)Pose's location.
			const pos = new THREE.Vector3().copy(xrPose.transform.position);
			const rot = new THREE.Quaternion().copy(xrPose.transform.orientation);
			// Note: The default Ray direction is (0, 0, -1)
			const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(rot);
			this._prevPoseData = {
				xrPose: xrPose,
				pos: pos,
				rot: rot,
				dir: dir
			};

			this.raycaster.set(this._prevPoseData.pos, this._prevPoseData.dir);

			this._dbgGizmo.position.copy(this._prevPoseData.pos);
			this._dbgGizmo.quaternion.copy(this._prevPoseData.rot);
			this._dbgArrow.position.copy(this._prevPoseData.pos);
			this._dbgArrow.setDirection(this._prevPoseData.dir);

			// DEBUG -> The first set of raycasted objects will
			// be the hud items. So show clones of these in the
			// scene, at their location when the ray was casted.
			if ( this._debug ) {
				while ( true ) {
					const obj = g_scene.getObjectByName("debugHUDItem");
					if ( !obj ) {
						break;
					}
					g_scene.remove(obj);
					obj.material.dispose();
				}
				for ( const obj of objects ) {
					const hudItem = obj.clone();
					hudItem.material = new THREE.MeshBasicMaterial();
					hudItem.name = "debugHUDItem";
					g_scene.add(hudItem);
				}
			}
			// DEBUG <-
		}

		return this.raycaster.intersectObjects(objects, recursive, optionalTarget);
	}
}

