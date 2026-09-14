package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"

	_ "github.com/go-sql-driver/mysql"
	"github.com/golang-migrate/migrate/v4"
	mysqlMigrate "github.com/golang-migrate/migrate/v4/database/mysql"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, using system environment variables")
	}

	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	if dbPort == "" {
		dbPort = "3306"
	}

	if dbHost == "" || dbUser == "" || dbName == "" {
		log.Fatalf("Error: Database configuration is incomplete. Please configure DB_HOST, DB_USER, and DB_NAME in .env")
	}

	// Ensure database exists
	serverDSN := fmt.Sprintf("%s:%s@tcp(%s:%s)/", dbUser, dbPassword, dbHost, dbPort)
	serverDB, err := sql.Open("mysql", serverDSN)
	if err != nil {
		log.Fatalf("Error connecting to MySQL server: %v", err)
	}
	if err := serverDB.Ping(); err != nil {
		log.Fatalf("Error pinging MySQL server at %s:%s: %v", dbHost, dbPort, err)
	}
	_, err = serverDB.Exec(fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;", dbName))
	serverDB.Close()
	if err != nil {
		log.Fatalf("Error creating database %s: %v", dbName, err)
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&multiStatements=true",
		dbUser, dbPassword, dbHost, dbPort, dbName,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Error opening database connection: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Error pinging database: %v", err)
	}

	driver, err := mysqlMigrate.WithInstance(db, &mysqlMigrate.Config{})
	if err != nil {
		log.Fatalf("Error creating migration driver: %v", err)
	}

	m, err := migrate.NewWithDatabaseInstance(
		"file://migrations",
		"mysql",
		driver,
	)
	if err != nil {
		log.Fatalf("Error initializing migrate instance: %v", err)
	}

	cmd := "up"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	switch cmd {
	case "up":
		if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			log.Fatalf("Migration up failed: %v", err)
		}
		fmt.Println("Migrations applied successfully (up).")
	case "down":
		if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			log.Fatalf("Migration down failed: %v", err)
		}
		fmt.Println("Migrations rolled back successfully (down).")
	case "force":
		if len(os.Args) < 3 {
			log.Fatalf("Usage: go run ./cmd/migrate force <version>")
		}
		var version int
		if _, err := fmt.Sscanf(os.Args[2], "%d", &version); err != nil {
			log.Fatalf("Invalid version number: %s", os.Args[2])
		}
		if err := m.Force(version); err != nil {
			log.Fatalf("Migration force failed: %v", err)
		}
		fmt.Printf("Migration version forced to %d (dirty state cleared).\n", version)
	default:
		log.Fatalf("Unknown command: %s. Use 'up', 'down', or 'force <version>'.", cmd)
	}
}
