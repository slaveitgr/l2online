/**
 * S3 mesh-decoder smoke-test fixtures.
 *
 * Each fixture is a (objectName, expected verts, expected tris) triple
 * pulled from a known-good package. Populate as fixtures arrive — e.g.
 * `Fmagic_m031_u` from LineageWarrior.ukx with its actual counts.
 *
 * The driver (added with the S3 unit-test scaffold) will:
 *   1. resolvePackageForObject(name) to find the .ukx
 *   2. fetch + decrypt the package
 *   3. locate the export blob
 *   4. decodeMeshBlob() and assert positions.length / indices.length match.
 */

export interface MeshFixture {
  objectName: string;
  packageHint?: string;
  expectedVerts: number;
  expectedTris: number;
}

export const meshFixtures: MeshFixture[] = [
  // Waiting on canonical fixture from Claude:
  // { objectName: "Fmagic_m031_u", packageHint: "LineageWarrior.ukx",
  //   expectedVerts: 0, expectedTris: 0 },
];
