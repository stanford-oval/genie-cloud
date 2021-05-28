package sql

// UserDevice table
type UserDevice struct {
	Key
	State string `json:"state" gorm:"column:state"`
}

// TableName overrides table name to `user_device`
func (*UserDevice) TableName() string {
	return "user_device"
}

// NewRow returns a UserDevice row
func (*UserDevice) NewRow() Model {
	return &UserDevice{}
}

// NewRows returns a slice of UserDevice row
func (*UserDevice) NewRows() interface{} {
	return []UserDevice{}
}

// SetKey sets the key of UserDevice
func (e *UserDevice) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserDevice
func (e *UserDevice) GetKey() Key {
	return e.Key
}
