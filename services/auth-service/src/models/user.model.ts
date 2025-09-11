import mongoose, { Document } from "mongoose";

export const USER_COLLECTION = "users";
export const USER_MODEL = "User";

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: USER_COLLECTION,
  }
);

export default mongoose.model<IUser>(USER_MODEL, userSchema, USER_COLLECTION);
