package main

import (
	"almond-cloud/sql"
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path"

	"gorm.io/gorm"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Printf("Usage: %v <table.json>\n", os.Args[0])
		os.Exit(1)
	}
	db, err := sql.NewMySQL(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	if err := loadDatabase(db, os.Args[1]); err != nil {
		log.Fatal(err)
	}
	fmt.Println("Done")
}

func loadDatabase(db *gorm.DB, inputFile string) error {
	file, err := os.Open(inputFile)
	if err != nil {
		return err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		row := getRowFromFilename(inputFile)
		if err := json.Unmarshal(scanner.Bytes(), row); err != nil {
			return err
		}
		if len(row.GetKey().UniqueID) == 0 {
			return fmt.Errorf("UniqueId must not be null: %s", scanner.Text())
		}
		if row.GetKey().UserID == 0 {
			return fmt.Errorf("UserId must not be 0: %s", scanner.Text())
		}
		fmt.Printf("%+v\n", row)
		if err := db.Create(row).Error; err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	return nil
}

func getRowFromFilename(filename string) sql.Row {
	switch path.Base(filename) {
	case "user_app.json":
		return &sql.UserApp{}
	case "user_channel.json":
		return &sql.UserChannel{}
	case "user_device.json":
		return &sql.UserDevice{}
	case "user_device_journal.json":
		return &sql.UserDeviceJournal{}
	default:
		log.Fatal("Unknown table name: " + filename)
	}
	return nil
}
