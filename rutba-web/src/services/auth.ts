import { BASE_URL } from "../static/const";
import {
  RequestSignInCredential,
  RequestSignInWithProviders,
  RequestSignUpCredential,
  ResponseAuth,
} from "@/types/api/auth";
import axios from "axios";
import { WebAuthEndpoints } from "@/endpoints";

export async function signInWithCredential(req: RequestSignInCredential) {
  try {
    const ep = WebAuthEndpoints.localSignIn();
    const response = await axios.post(`${BASE_URL}${ep.path}`, {
      identifier: req.email,
      password: req.password,
    });

    return response.data as ResponseAuth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error?.response?.data?.error) {
      throw error.response.data.error.message;
    } else {
      throw error;
    }
  }
}

export async function signInWithProviders(req: RequestSignInWithProviders) {
  try {
    const ep = WebAuthEndpoints.providerCallback(req?.provider, req?.access_token);
    const response: {
      data: ResponseAuth;
    } = await axios.get(`${BASE_URL}${ep.path}`, { params: ep.params });

    return response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error?.response?.data?.error) {
      throw error.response.data.error.message;
    } else {
      throw error;
    }
  }
}

export async function signUpWithCredential(data: RequestSignUpCredential) {
  try {
    const ep = WebAuthEndpoints.localRegister();
    const response: ResponseAuth = await axios.post(`${BASE_URL}${ep.path}`, {
      displayName: data.name,
      email: data.email,
      username: data.email,
      password: data.password,
    });

    return response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error?.response?.data?.error) {
      throw error.response.data.error.message;
    } else {
      throw error;
    }
  }
}
