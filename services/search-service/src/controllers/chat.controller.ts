import { AuthRequest } from "../middlewares/auth.middleware";
import { Response } from "express";
import { es } from "../config";
import { fulfilled, rejected } from "../utils/response.util";

export const search = async (req: AuthRequest, res: Response) => {
  const q = req.query.q as string;

  if (!q) {
    return res.status(400).json(rejected("Search parameter is missing."));
  }

  try {
    const [users, messages] = await Promise.all([
      es.search({
        index: "users-v1",
        query: {
          multi_match: {
            query: q,
            fields: ["firstName", "lastName", "email"],
          },
        },
      }),
      es.search({
        index: "messages-v1",
        query: {
          match: { text: q },
        },
      }),
    ]);

    res.status(200).json(
      fulfilled("Search results fetched successfully.", {
        users: users.hits.hits.map((h: any) => h._source),
        messages: messages.hits.hits.map((h: any) => h._source),
      })
    );
  } catch (error) {
    res.status(500).json(rejected("Could not search the chat."));
  }
};
