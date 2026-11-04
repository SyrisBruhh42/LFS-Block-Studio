import * as THREE from 'three';

export interface BoxBoySocket {
  name: string;
  bone: THREE.Group | THREE.Object3D;
}

export class BoxBoyHeroVoxelRig {
  public root: THREE.Group;
  public head: THREE.Mesh;
  public body: THREE.Mesh;
  public leftArm: THREE.Mesh;
  public rightArm: THREE.Mesh;
  public leftLeg: THREE.Mesh;
  public rightLeg: THREE.Mesh;
  public sockets: Map<string, BoxBoySocket>;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'BoxBoyHero';
    this.sockets = new Map();

    const material = new THREE.MeshBasicMaterial({ color: 0xcccccc });

    // Head
    const headGeom = new THREE.BoxGeometry(1, 1, 1);
    this.head = new THREE.Mesh(headGeom, material);
    this.head.position.set(0, 1.5, 0);
    this.head.name = 'Head';
    this.root.add(this.head);

    // Body
    const bodyGeom = new THREE.BoxGeometry(1, 1.5, 0.5);
    this.body = new THREE.Mesh(bodyGeom, material);
    this.body.position.set(0, 0.25, 0);
    this.body.name = 'Body';
    this.root.add(this.body);

    // Left Arm
    const armGeom = new THREE.BoxGeometry(0.5, 1.5, 0.5);
    this.leftArm = new THREE.Mesh(armGeom, material);
    this.leftArm.position.set(-0.75, 0.25, 0);
    this.leftArm.name = 'LeftArm';
    this.root.add(this.leftArm);

    // Right Arm
    this.rightArm = new THREE.Mesh(armGeom, material);
    this.rightArm.position.set(0.75, 0.25, 0);
    this.rightArm.name = 'RightArm';
    this.root.add(this.rightArm);

    // Left Leg
    const legGeom = new THREE.BoxGeometry(0.5, 1.5, 0.5);
    this.leftLeg = new THREE.Mesh(legGeom, material);
    this.leftLeg.position.set(-0.25, -1.25, 0);
    this.leftLeg.name = 'LeftLeg';
    this.root.add(this.leftLeg);

    // Right Leg
    this.rightLeg = new THREE.Mesh(legGeom, material);
    this.rightLeg.position.set(0.25, -1.25, 0);
    this.rightLeg.name = 'RightLeg';
    this.root.add(this.rightLeg);

    // Sockets for weapons/items
    this.addSocket('rightHand', this.rightArm, new THREE.Vector3(0, -0.75, 0));
    this.addSocket('leftHand', this.leftArm, new THREE.Vector3(0, -0.75, 0));
    this.addSocket('head', this.head, new THREE.Vector3(0, 0.5, 0));
  }

  private addSocket(name: string, parent: THREE.Object3D, offset: THREE.Vector3) {
    const socket = new THREE.Group();
    socket.name = `Socket_${name}`;
    socket.position.copy(offset);
    parent.add(socket);
    this.sockets.set(name, { name, bone: socket });
  }

  public getSocket(name: string): BoxBoySocket | undefined {
    return this.sockets.get(name);
  }

  public getRoot(): THREE.Group {
    return this.root;
  }
}
