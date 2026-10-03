import java.sql.*;
public class DatabaseCli {
    public static void main(String[] args) throws Exception {
        String url = System.getenv().getOrDefault("DB_URL", "jdbc:postgresql://localhost:5432/tryonbd");
        url = url.replaceFirst("/[^/?]+(\\?.*)?$", "/" + args[0]);
        try (Connection connection = DriverManager.getConnection(url,
                System.getenv().getOrDefault("DB_USERNAME", "postgres"),
                System.getenv().getOrDefault("DB_PASSWORD", "postgres"));
             Statement statement = connection.createStatement()) {
            if (statement.execute(args[1])) {
                try (ResultSet rows = statement.getResultSet()) {
                    int columns = rows.getMetaData().getColumnCount();
                    for (int i = 1; i <= columns; i++) System.out.print(rows.getMetaData().getColumnLabel(i) + "\t");
                    System.out.println();
                    while (rows.next()) {
                        for (int i = 1; i <= columns; i++) System.out.print(rows.getString(i) + "\t");
                        System.out.println();
                    }
                }
            } else System.out.println("SQL completed: " + statement.getUpdateCount());
        }
    }
}
