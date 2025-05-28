 CREATE DATABASE FaceTimeDB COLLATE Vietnamese_CI_AS;
GO
USE FaceTimeDB;


IF OBJECT_ID('dbo.attendance_logs', 'U') IS NOT NULL
    DROP TABLE dbo.attendance_logs;
GO
IF OBJECT_ID('dbo.face_encodings', 'U') IS NOT NULL
    DROP TABLE dbo.face_encodings;
GO

IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Users_Username_Unique_NotNull' AND object_id = OBJECT_ID('dbo.users'))
    DROP INDEX IX_Users_Username_Unique_NotNull ON dbo.users;
GO

DECLARE @constraintNameToDrop NVARCHAR(255);
SELECT @constraintNameToDrop = CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'dbo' 
  AND TABLE_NAME = 'users' 
  AND CONSTRAINT_TYPE = 'UNIQUE' 
  AND CONSTRAINT_NAME LIKE 'UQ__users%'; 
IF @constraintNameToDrop IS NOT NULL
BEGIN
    EXEC('ALTER TABLE dbo.users DROP CONSTRAINT ' + @constraintNameToDrop);
    PRINT 'Dropped old unique constraint on username: ' + @constraintNameToDrop;
END
GO
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL
    DROP TABLE dbo.users;
GO


CREATE TABLE dbo.users (

    id NVARCHAR(50) NOT NULL,


    username NVARCHAR(100) NULL,


    password_hash NVARCHAR(255) NULL,


    full_name NVARCHAR(255) COLLATE Vietnamese_CI_AS NOT NULL,


    work_status NVARCHAR(50) NOT NULL DEFAULT 'active',

    has_face_data BIT NOT NULL DEFAULT 0,


    is_admin BIT NOT NULL DEFAULT 0,


    created_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),


    updated_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT PK_users PRIMARY KEY (id) -
);
GO


CREATE UNIQUE NONCLUSTERED INDEX IX_Users_Username_Unique_NotNull
ON dbo.users(username)
WHERE username IS NOT NULL;
GO

PRINT 'Table "users" created successfully with Vietnamese collation for full_name and filtered unique index on username.';
GO


CREATE TABLE dbo.face_encodings (
    id INT IDENTITY(1,1) NOT NULL,
    user_id NVARCHAR(50) NOT NULL,
    encoding VARBINARY(MAX) NOT NULL,

    image_filename NVARCHAR(512) NULL,
    created_at DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT PK_face_encodings PRIMARY KEY (id),
    CONSTRAINT FK_face_encodings_users FOREIGN KEY (user_id)
        REFERENCES dbo.users (id)
        ON DELETE CASCADE
);
GO
CREATE INDEX IX_face_encodings_user_id ON dbo.face_encodings(user_id);
GO
PRINT 'Table "face_encodings" created successfully.';
GO


CREATE TABLE dbo.attendance_logs (
    id INT IDENTITY(1,1) NOT NULL,
    user_id NVARCHAR(50) NOT NULL,
    [timestamp] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),

    recognized_image_filename NVARCHAR(512) NULL,

    CONSTRAINT PK_attendance_logs PRIMARY KEY (id),
    CONSTRAINT FK_attendance_logs_users FOREIGN KEY (user_id)
        REFERENCES dbo.users (id)
        ON DELETE NO ACTION
);
GO
CREATE INDEX IX_attendance_logs_user_id ON dbo.attendance_logs(user_id);
GO
CREATE INDEX IX_attendance_logs_timestamp ON dbo.attendance_logs([timestamp]);
GO
PRINT 'Table "attendance_logs" created successfully.';
GO

PRINT 'Database schema setup complete with Vietnamese language support considerations.';
GO