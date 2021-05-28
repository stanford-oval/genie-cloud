package sql

// UserChannel table
type UserChannel struct {
	Key
	Value string `json:"value" gorm:"column:value"`
}

// TableName overrides table name to `user_channel`
func (*UserChannel) TableName() string {
	return "user_channel"
}

// NewRow returns a UserChannel row
func (*UserChannel) NewRow() Model {
	return &UserChannel{}
}

// NewRows returns a slice of UserChannel row
func (*UserChannel) NewRows() interface{} {
	return &[]UserChannel{}
}

// SetKey sets the key of UserChannel
func (e *UserChannel) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserChannel
func (e *UserChannel) GetKey() Key {
	return e.Key
}
