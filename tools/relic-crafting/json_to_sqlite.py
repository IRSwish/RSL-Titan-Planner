import json
import sqlite3
import os

def create_database(json_file, db_file):
    """Convert relics-infos.json to SQLite database"""

    # Load JSON data
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Delete existing database if it exists
    if os.path.exists(db_file):
        os.remove(db_file)
        print(f"Deleted existing database: {db_file}")

    # Create SQLite connection
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    # Create relic_craft_results table
    cursor.execute('''
        CREATE TABLE relic_craft_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comp_rare REAL NOT NULL,
            comp_epic REAL NOT NULL,
            comp_legendary REAL NOT NULL,
            comp_mythical REAL NOT NULL,
            result_rare REAL NOT NULL,
            result_epic REAL NOT NULL,
            result_legendary REAL NOT NULL,
            result_mythical REAL NOT NULL
        )
    ''')

    # Create relics table
    cursor.execute('''
        CREATE TABLE relics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            "group" TEXT NOT NULL,
            rarity TEXT NOT NULL,
            image TEXT NOT NULL,
            description TEXT
        )
    ''')

    # Insert relic_craft_results data
    for result in data['relic_craft_results']:
        comp = result['composition']
        res = result['result']
        cursor.execute('''
            INSERT INTO relic_craft_results
            (comp_rare, comp_epic, comp_legendary, comp_mythical,
             result_rare, result_epic, result_legendary, result_mythical)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            comp['rare'], comp['epic'], comp['legendary'], comp['mythical'],
            res['rare'], res['epic'], res['legendary'], res['mythical']
        ))

    # Insert relics data
    for relic in data['relics']:
        cursor.execute('''
            INSERT INTO relics (name, "group", rarity, image, description)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            relic['name'],
            relic['group'],
            relic['rarity'],
            relic['image'],
            relic.get('description', '')
        ))

    # Create indexes for better query performance
    cursor.execute('CREATE INDEX idx_relics_rarity ON relics(rarity)')
    cursor.execute('CREATE INDEX idx_relics_group ON relics("group")')
    cursor.execute('CREATE INDEX idx_craft_comp ON relic_craft_results(comp_rare, comp_epic, comp_legendary, comp_mythical)')

    # Commit and close
    conn.commit()
    conn.close()

    print(f"[OK] Database created: {db_file}")
    print(f"[OK] Imported {len(data['relic_craft_results'])} craft results")
    print(f"[OK] Imported {len(data['relics'])} relics")

def show_stats(db_file):
    """Display some statistics from the database"""
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    print("\n--- Database Statistics ---")

    # Relics by rarity
    cursor.execute('SELECT rarity, COUNT(*) FROM relics GROUP BY rarity ORDER BY COUNT(*) DESC')
    print("\nRelics by rarity:")
    for rarity, count in cursor.fetchall():
        print(f"  {rarity}: {count}")

    # Relics by group
    cursor.execute('SELECT "group", COUNT(*) FROM relics GROUP BY "group" ORDER BY COUNT(*) DESC')
    print("\nRelics by group:")
    for group, count in cursor.fetchall():
        print(f"  {group}: {count}")

    # Best composition for mythical
    cursor.execute('''
        SELECT comp_rare, comp_epic, comp_legendary, comp_mythical, result_mythical
        FROM relic_craft_results
        ORDER BY result_mythical DESC
        LIMIT 5
    ''')
    print("\nTop 5 compositions for Mythical drops:")
    for row in cursor.fetchall():
        print(f"  R:{int(row[0])}% E:{int(row[1])}% L:{int(row[2])}% M:{int(row[3])}% -> Mythical: {row[4]}%")

    conn.close()

if __name__ == "__main__":
    json_file = "relics-infos.json"
    db_file = "relics.db"

    create_database(json_file, db_file)
    show_stats(db_file)

    print("\n--- Example queries ---")
    print("# Get all Mythical relics:")
    print("  SELECT * FROM relics WHERE rarity = 'Mythical'")
    print("\n# Find best composition for Legendary drops:")
    print("  SELECT * FROM relic_craft_results ORDER BY result_legendary DESC LIMIT 1")
    print("\n# Count relics by group:")
    print("  SELECT \"group\", COUNT(*) FROM relics GROUP BY \"group\"")
