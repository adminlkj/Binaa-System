import { db } from '../src/lib/db'
async function main() {
  const [clients, projects, projectsNotDeleted, equipment, jEs] = await Promise.all([
    db.client.count(),
    db.project.count(),
    db.project.count({ where: { deletedAt: null } }),
    db.equipment.count(),
    db.journalEntry.count({ where: { status: 'POSTED' } }),
  ])
  console.log('clients:', clients)
  console.log('projects:', projects)
  console.log('projects (not deleted):', projectsNotDeleted)
  console.log('equipment:', equipment)
  console.log('POSTED journal entries:', jEs)
  const sampleProject = await db.project.findFirst({ select: { id: true, code: true, name: true, deletedAt: true } })
  console.log('sample project:', sampleProject)
  const sampleClient = await db.client.findFirst({ select: { id: true, code: true, name: true } })
  console.log('sample client:', sampleClient)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
