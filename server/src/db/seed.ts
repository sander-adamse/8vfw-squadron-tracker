import bcrypt from 'bcryptjs'
import pool from './pool'

const seed = async () => {
  console.log('Seeding database...')

  try {
    // Create wings
    const wingNames = ['VFA-143']
    const wingIds: Record<string, string> = {}
    for (const name of wingNames) {
      const result = await pool.query(
        `INSERT INTO wings (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [name]
      )
      wingIds[name] = result.rows[0].id
    }

    // Create admin user
    const passwordHash = await bcrypt.hash('password', 10)

    const users = [
      { email: 'juicebox@dcs.mil', role: 'admin' },
    ]

    const userIds: Record<string, string> = {}
    for (const u of users) {
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, role) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (email) DO UPDATE SET role = $3
         RETURNING id`,
        [u.email, passwordHash, u.role]
      )
      userIds[u.email] = result.rows[0].id
    }

    // Create admin pilot
    const pilots = [
      { callsign: 'Juicebox', first_name: 'Sander', last_name: 'Adamse', wing: 'VFA-143', role: 'admin', email: 'juicebox@dcs.mil' },
    ]

    const pilotIds: Record<string, string> = {}
    for (const p of pilots) {
      const result = await pool.query(
        `INSERT INTO pilots (user_id, callsign, first_name, last_name, wing_id, role, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [userIds[p.email], p.callsign, p.first_name, p.last_name, wingIds[p.wing], p.role, p.email]
      )
      if (result.rows.length > 0) {
        pilotIds[p.callsign] = result.rows[0].id
      }
    }

    // Create skills - VFA-143 FA/18 Qualification Structure
    const vfa143 = wingIds['VFA-143']
    const skills = [
      // 90TH BASIC
      { name: 'Startup', category: '90TH BASIC', sort_order: 1 },
      { name: 'Radios', category: '90TH BASIC', sort_order: 2 },
      { name: 'IFF and Squawks', category: '90TH BASIC', sort_order: 3 },
      { name: 'Datalink and SA', category: '90TH BASIC', sort_order: 4 },
      { name: 'Airfield Ops', category: '90TH BASIC', sort_order: 5 },
      { name: 'Waypoint Navigation', category: '90TH BASIC', sort_order: 6 },
      { name: 'TACAN Navigation', category: '90TH BASIC', sort_order: 7 },
      { name: 'Basic COMM', category: '90TH BASIC', sort_order: 8 },
      { name: 'Basic Form', category: '90TH BASIC', sort_order: 9 },
      { name: 'Basic Checkride', category: '90TH BASIC', sort_order: 10 },
      // 90TH ADVANCED
      { name: 'Advanced COMM', category: '90TH ADVANCED', sort_order: 11 },
      { name: 'Autopilot', category: '90TH ADVANCED', sort_order: 12 },
      { name: 'Air-to-Air Refueling', category: '90TH ADVANCED', sort_order: 13 },
      { name: 'CASE I Procedures', category: '90TH ADVANCED', sort_order: 14 },
      { name: 'FENCE In / Out', category: '90TH ADVANCED', sort_order: 15 },
      { name: 'DTC Usage', category: '90TH ADVANCED', sort_order: 16 },
      { name: 'Advanced Checkride', category: '90TH ADVANCED', sort_order: 17 },
      // B - SENSORS
      { name: 'A/G - GMT Radar', category: 'B - SENSORS', sort_order: 18 },
      { name: 'A/G - SEA Radar', category: 'B - SENSORS', sort_order: 19 },
      { name: 'A/G - MAP Radar', category: 'B - SENSORS', sort_order: 20 },
      { name: 'A/G - EXP Modes', category: 'B - SENSORS', sort_order: 21 },
      { name: 'A/A - RWS / TWS', category: 'B - SENSORS', sort_order: 22 },
      { name: 'A/A - RAID Mode', category: 'B - SENSORS', sort_order: 23 },
      { name: 'ATFLIR Pod', category: 'B - SENSORS', sort_order: 24 },
      { name: 'JHMCS Modes', category: 'B - SENSORS', sort_order: 25 },
      // B - A/G WEAPONS 1
      { name: 'CCIP Bombs', category: 'B - A/G WEAPONS 1', sort_order: 26 },
      { name: 'CCIP Rockets', category: 'B - A/G WEAPONS 1', sort_order: 27 },
      { name: 'Laser Bombs', category: 'B - A/G WEAPONS 1', sort_order: 28 },
      { name: 'Laser Mavericks', category: 'B - A/G WEAPONS 1', sort_order: 29 },
      { name: 'IR Mavericks', category: 'B - A/G WEAPONS 1', sort_order: 30 },
      { name: 'GPS Weapons (TOO)', category: 'B - A/G WEAPONS 1', sort_order: 31 },
      { name: 'GPS Weapons (PP)', category: 'B - A/G WEAPONS 1', sort_order: 32 },
      { name: 'A/G Checkride 1', category: 'B - A/G WEAPONS 1', sort_order: 33 },
      // B - A/G WEAPONS 2
      { name: 'AGM-88C HARM (PB)', category: 'B - A/G WEAPONS 2', sort_order: 34 },
      { name: 'AGM-88C HARM (SP)', category: 'B - A/G WEAPONS 2', sort_order: 35 },
      { name: 'AGM-88C HARM (TOO)', category: 'B - A/G WEAPONS 2', sort_order: 36 },
      { name: 'AGM-84 - Anti-Ship', category: 'B - A/G WEAPONS 2', sort_order: 37 },
      { name: 'AGM-84 - DL Pod', category: 'B - A/G WEAPONS 2', sort_order: 38 },
      { name: 'ADM-141A TALD', category: 'B - A/G WEAPONS 2', sort_order: 39 },
      { name: 'M61A2 Gun A/G', category: 'B - A/G WEAPONS 2', sort_order: 40 },
      { name: 'A/G Checkride 2', category: 'B - A/G WEAPONS 2', sort_order: 41 },
      // B - A/A WEAPONS
      { name: 'AIM-9 Sidewinder', category: 'B - A/A WEAPONS', sort_order: 42 },
      { name: 'M61A2 Gun A/A', category: 'B - A/A WEAPONS', sort_order: 43 },
      { name: 'AIM-120 AMRAAM', category: 'B - A/A WEAPONS', sort_order: 44 },
      { name: 'AIM-7 Sparrow', category: 'B - A/A WEAPONS', sort_order: 45 },
      { name: 'A/A Checkride', category: 'B - A/A WEAPONS', sort_order: 46 },
      // ADVANCED FLYING
      { name: 'Tactical Formation', category: 'ADVANCED FLYING', sort_order: 47 },
      { name: 'Low Level Flying', category: 'ADVANCED FLYING', sort_order: 48 },
      { name: 'Night Flying', category: 'ADVANCED FLYING', sort_order: 49 },
      { name: 'Night Refueling', category: 'ADVANCED FLYING', sort_order: 50 },
      { name: 'BVR Tactics', category: 'ADVANCED FLYING', sort_order: 51 },
      { name: 'ACM Tactics', category: 'ADVANCED FLYING', sort_order: 52 },
      { name: 'CASE III Procedures', category: 'ADVANCED FLYING', sort_order: 53 },
      // LEAD UPGRADE
      { name: '2-Ship Lead', category: 'LEAD UPGRADE', sort_order: 54 },
      { name: '4-Ship Lead', category: 'LEAD UPGRADE', sort_order: 55 },
      { name: 'Package Leader', category: 'LEAD UPGRADE', sort_order: 56 },
      { name: 'Instructor Pilot', category: 'LEAD UPGRADE', sort_order: 57 },
    ]

    const skillIds: Record<string, string> = {}
    for (const s of skills) {
      const result = await pool.query(
        `INSERT INTO skills (wing_id, name, category, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [vfa143, s.name, s.category, s.sort_order]
      )
      if (result.rows.length > 0) {
        skillIds[s.name] = result.rows[0].id
      }
    }

    // No sample qualifications - admin starts with clean slate

    console.log('Seeding completed successfully.')
    console.log(`Created ${Object.keys(wingIds).length} wings`)
    console.log(`Created ${Object.keys(userIds).length} users (password: "password")`)
    console.log(`Created ${Object.keys(pilotIds).length} pilots`)
    console.log(`Created ${Object.keys(skillIds).length} skills`)
    console.log(`Admin User: juicebox@dcs.mil / password`)
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

seed()
